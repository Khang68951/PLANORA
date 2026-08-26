import { readFile } from "node:fs/promises";
import sanitizeHtml from "sanitize-html";
import { NextResponse } from "next/server";
import { effectiveAIConfig, extractVisibleAIStreamText, normalizeAIProposals, openProjectChatStream, parseAIResult } from "@/lib/ai";
import { isUuid } from "@/lib/categories";
import { getPool, query } from "@/lib/db";
import { isAIReadableFile, storagePath } from "@/lib/project-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const streamEvent = (type, data = {}) => encoder.encode(`${JSON.stringify({ type, ...data })}\n`);

async function projectContext(id) {
  const [project, members, items, documents, files, history, settings] = await Promise.all([
    query(`SELECT title AS name, description, project_type AS type, start_date, deadline, status, progress FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id]),
    query("SELECT id, name, role FROM project_members WHERE project_id = $1 ORDER BY name", [id]),
    query(`SELECT item.id, item.title, item.description, item.kind, item.start_at, item.end_at, item.due_at, item.status, item.priority,
      COALESCE(json_agg(json_build_object('id', member.id, 'name', member.name)) FILTER (WHERE member.id IS NOT NULL), '[]') AS assignees
      FROM planner_items item LEFT JOIN planner_item_assignees assignment ON assignment.item_id = item.id LEFT JOIN project_members member ON member.id = assignment.member_id
      WHERE item.project_id = $1 AND item.deleted_at IS NULL GROUP BY item.id ORDER BY COALESCE(item.start_at, item.due_at)`, [id]),
    query(`SELECT id, title, content_html AS "contentHtml", updated_at AS "updatedAt"
      FROM project_documents WHERE project_id = $1 ORDER BY updated_at DESC`, [id]),
    query("SELECT original_name AS name, stored_name, mime_type AS \"mimeType\", size_bytes::int AS \"sizeBytes\" FROM project_files WHERE project_id = $1 ORDER BY created_at DESC", [id]),
    query(`SELECT role, content FROM (
      SELECT role, content, created_at FROM project_ai_messages WHERE project_id = $1
      ORDER BY created_at DESC, CASE role WHEN 'assistant' THEN 0 ELSE 1 END LIMIT 16
    ) recent ORDER BY created_at, CASE role WHEN 'user' THEN 0 ELSE 1 END`, [id]),
    query("SELECT ai_provider, ai_model FROM planner_settings WHERE id = 1"),
  ]);
  if (!project.rowCount) return null;
  const readableFiles = [];
  let remaining = 40_000;
  for (const file of files.rows) {
    if (!isAIReadableFile(file) || remaining <= 0) continue;
    try {
      const text = (await readFile(storagePath(id, file.stored_name).target, "utf8")).slice(0, Math.min(12_000, remaining));
      remaining -= text.length; readableFiles.push({ name: file.name, content: text });
    } catch { readableFiles.push({ name: file.name, content: "[Local file missing or unreadable]" }); }
  }
  return {
    project: project.rows[0], members: members.rows, items: items.rows,
    documents: documents.rows.map((document) => ({
      id: document.id, title: document.title, updatedAt: document.updatedAt,
      contentHtml: document.contentHtml.slice(0, 40_000),
      contentText: sanitizeHtml(document.contentHtml, { allowedTags: [] }).slice(0, 20_000),
    })),
    files: files.rows.map(({ stored_name: _stored, ...file }) => file), readableFiles,
    history: history.rows.map((message) => message.role === "assistant" ? { ...message, content: parseAIResult(message.content).message } : message),
    config: effectiveAIConfig(settings.rows[0]),
  };
}

export async function POST(request, context) {
  try {
    const { id } = await context.params; const body = await request.json();
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
    if (typeof body.message !== "string" || !body.message.trim() || body.message.trim().length > 4000) return NextResponse.json({ error: "Enter a message using 4,000 characters or fewer." }, { status: 400 });
    const contextData = await projectContext(id);
    if (!contextData) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const system = `You are Planora's AI assistant for exactly one project. Use only the supplied project context. Do not claim that data has been saved. Return ONLY valid JSON with this shape: {"message":"helpful response","proposedChanges":[]}.
When the user asks to create or modify database data, place proposals in proposedChanges for human review. Allowed proposals are {"type":"createTask","data":{"title":"","description":"","kind":"task","startAt":"ISO","endAt":"ISO","priority":"low|medium|high","assigneeIds":[]}}, {"type":"createDeadline","data":{"title":"","description":"","kind":"deadline","dueAt":"ISO","priority":"low|medium|high","assigneeIds":[]}}, {"type":"createDocument","data":{"title":"","contentHtml":"<p>...</p>"}}, and {"type":"updateDocument","data":{"documentId":"an exact supplied document id","title":"optional new title","contentHtml":"the complete replacement HTML"}}. For updateDocument, preserve all content the user did not ask to change and return the complete replacement document, never a fragment. Never emit delete proposals. Current time: ${new Date().toISOString()}.
PROJECT CONTEXT:\n${JSON.stringify({ project: contextData.project, members: contextData.members, tasksAndDeadlines: contextData.items, documents: contextData.documents, files: contextData.files, readableFileContents: contextData.readableFiles })}`;
    const messages = [{ role: "system", content: system }, ...contextData.history, { role: "user", content: body.message.trim() }];
    const providerStream = await openProjectChatStream({ ...contextData.config, messages });
    const responseStream = new ReadableStream({
      start(controller) {
        void (async () => {
        let raw = "";
        let visible = "";
        try {
          for await (const token of providerStream) {
            raw += token;
            const partial = extractVisibleAIStreamText(raw);
            if (partial.startsWith(visible) && partial.length > visible.length) {
              const text = partial.slice(visible.length);
              visible = partial;
              controller.enqueue(streamEvent("delta", { text }));
            }
          }
          if (!raw.trim()) throw new Error(`${contextData.config.provider} returned an empty response.`);
          const parsed = parseAIResult(raw);
          if (parsed.message.startsWith(visible) && parsed.message.length > visible.length) {
            controller.enqueue(streamEvent("delta", { text: parsed.message.slice(visible.length) }));
          } else if (parsed.message !== visible) controller.enqueue(streamEvent("replace", { text: parsed.message }));
          const proposedChanges = normalizeAIProposals(parsed.proposedChanges, { documents: contextData.documents });
          const client = await getPool().connect();
          try {
            await client.query("BEGIN");
            const saved = await client.query(`INSERT INTO project_ai_messages (project_id, role, content)
              VALUES ($1, 'user', $2), ($1, 'assistant', $3)
              RETURNING id, role, content, created_at AS "createdAt"`, [id, body.message.trim(), parsed.message.slice(0, 20_000)]);
            await client.query("COMMIT");
            const savedMessages = [saved.rows.find((message) => message.role === "user"), saved.rows.find((message) => message.role === "assistant")].filter(Boolean);
            controller.enqueue(streamEvent("done", { messages: savedMessages, proposedChanges, provider: contextData.config.provider, model: contextData.config.model }));
          } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
        } catch (error) {
          console.error("Stream project AI chat", error);
          controller.enqueue(streamEvent("error", { message: `AI request failed: ${error.message}` }));
        } finally { controller.close(); }
        })();
      },
    });
    return new Response(responseStream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) {
    console.error("POST project AI chat", error);
    const configuration = /API_KEY is not configured/.test(error.message);
    return NextResponse.json({ error: configuration ? `${error.message} Add it to .env.local and restart Planora.` : `AI request failed: ${error.message}` }, { status: configuration ? 503 : 502 });
  }
}

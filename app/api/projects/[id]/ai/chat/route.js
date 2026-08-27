import { readFile } from "node:fs/promises";
import sanitizeHtml from "sanitize-html";
import { NextResponse } from "next/server";
import { collectProjectAIResponse, effectiveAIConfig, extractVisibleAIStreamText, openProjectChatStream, parseAIResult } from "@/lib/ai";
import { aiCommandCatalog, commandRequiresApproval, executeAICommand, normalizeAICommandBatch, toAICommandModel } from "@/lib/ai-commands";
import { commandPlannerSystemInstruction, conversationSystemInstruction, fallbackClarificationQuestion, parseCommandPlannerResult, routeProjectAIRequest, scopedProjectContext } from "@/lib/ai-workflow";
import { isUuid } from "@/lib/categories";
import { getPool, query } from "@/lib/db";
import { materializeDocumentCommands } from "@/lib/document-insertion";
import { isAIReadableFile, storagePath } from "@/lib/project-files";
import { sanitizeDocumentHtml } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const streamEvent = (type, data = {}) => encoder.encode(`${JSON.stringify({ type, ...data })}\n`);

async function projectContext(id) {
  const [project, members, items, documents, files, history, settings] = await Promise.all([
    query(`SELECT id, title AS name, description, category_id AS "categoryId", project_type AS type, start_date, deadline, status, progress, ai_command_mode AS "aiCommandMode" FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id]),
    query("SELECT id, name, role FROM project_members WHERE project_id = $1 AND deleted_at IS NULL ORDER BY name", [id]),
    query(`SELECT item.id, item.title, item.description, item.kind, item.start_at, item.end_at, item.due_at, item.status, item.priority, item.updated_at AS "updatedAt",
      COALESCE(json_agg(json_build_object('id', member.id, 'name', member.name)) FILTER (WHERE member.id IS NOT NULL), '[]') AS assignees
      FROM planner_items item LEFT JOIN planner_item_assignees assignment ON assignment.item_id = item.id LEFT JOIN project_members member ON member.id = assignment.member_id AND member.deleted_at IS NULL
      WHERE item.project_id = $1 AND item.deleted_at IS NULL GROUP BY item.id ORDER BY COALESCE(item.start_at, item.due_at)`, [id]),
    query(`SELECT id, title, content_html AS "contentHtml", updated_at AS "updatedAt"
      FROM project_documents WHERE project_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`, [id]),
    query("SELECT id, original_name AS name, stored_name, mime_type AS \"mimeType\", size_bytes::int AS \"sizeBytes\" FROM project_files WHERE project_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC", [id]),
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
    reviewDocuments: documents.rows.map((document) => ({
      id: document.id,
      title: document.title,
      updatedAt: document.updatedAt,
      contentHtml: document.contentHtml,
    })),
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
    const workflow = routeProjectAIRequest(body.message.trim(), aiCommandCatalog());
    const allowedNames = new Set(workflow.allowedCommands.map((command) => command.name));
    const selectedContext = scopedProjectContext(contextData, workflow.scopes);
    const system = conversationSystemInstruction({ workflow, context: selectedContext });
    const messages = [{ role: "system", content: system }, ...contextData.history, { role: "user", content: body.message.trim() }];
    const providerStream = await openProjectChatStream({ ...contextData.config, messages });
    const responseStream = new ReadableStream({
      start(controller) {
        void (async () => {
        let raw = "";
        let visible = "";
        try {
          controller.enqueue(streamEvent("workflow", { stage: "route", intent: workflow.intent, scopes: workflow.scopes, label: "Request routed by Planora" }));
          controller.enqueue(streamEvent("workflow", { stage: "context", label: "Relevant project context prepared" }));
          controller.enqueue(streamEvent("workflow", { stage: "provider", label: `Answering with ${contextData.config.provider}` }));
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
          controller.enqueue(streamEvent("workflow", { stage: "validate", label: "Planning project actions" }));
          const parsed = parseAIResult(raw);
          if (parsed.message.startsWith(visible) && parsed.message.length > visible.length) {
            controller.enqueue(streamEvent("delta", { text: parsed.message.slice(visible.length) }));
          } else if (parsed.message !== visible) controller.enqueue(streamEvent("replace", { text: parsed.message }));
          const plannerMessages = [
            {
              role: "system",
              content: commandPlannerSystemInstruction({
                workflow,
                context: selectedContext,
                commandMode: contextData.project.aiCommandMode,
                currentTime: new Date().toISOString(),
              }),
            },
            ...contextData.history,
            { role: "user", content: body.message.trim() },
            { role: "assistant", content: parsed.message },
            { role: "user", content: "Produce the internal Planora command plan now." },
          ];
          let plannerParsed = { commands: [], clarificationQuestion: "", parseFailed: false };
          let plannerError = "";
          try {
            const plannerRaw = await collectProjectAIResponse({ ...contextData.config, messages: plannerMessages, maxTokens: 6000 });
            plannerParsed = parseCommandPlannerResult(plannerRaw);
          } catch (error) {
            plannerError = error.message;
          }
          const submittedCommands = plannerParsed.commands;
          const normalized = normalizeAICommandBatch(submittedCommands);
          const allowlisted = normalized.commands.filter((command) => allowedNames.has(command.name));
          const rejectedByRoute = normalized.commands
            .filter((command) => !allowedNames.has(command.name))
            .map((command) => ({ name: command.name, error: "This command was outside the routed request scope." }));
          const materialized = materializeDocumentCommands(allowlisted, contextData.reviewDocuments);
          const requestedCommands = materialized.commands.map((command) => {
            if (["documents.update", "documents.insert", "documents.remove"].includes(command.name)) {
              const previewContentHtml = sanitizeDocumentHtml(command.arguments.previewContentHtml);
              return {
                ...command,
                arguments: {
                  ...command.arguments,
                  previewContentHtml,
                  ...(command.name === "documents.update" ? { contentHtml: previewContentHtml } : {}),
                },
              };
            }
            if (command.name === "work.update") {
              const work = contextData.items.find((item) => item.id === command.arguments.workId);
              return work ? { ...command, arguments: { ...command.arguments, expectedUpdatedAt: work.updatedAt } } : command;
            }
            return command;
          });
          const commandRejections = [...normalized.rejections, ...rejectedByRoute, ...materialized.rejections];
          const expectsCommands = workflow.allowedCommands.some((command) => command.safety !== "read")
            && /\b(?:create|write|add|insert|remove|delete|edit|update|rename|assign|schedule|set|make)\b/i.test(body.message);
          const incompletePlan = commandRejections.length > 0;
          const needsClarification = Boolean(plannerParsed.clarificationQuestion)
            || (expectsCommands && (plannerError || plannerParsed.parseFailed || requestedCommands.length === 0 || incompletePlan));
          const responseMessage = needsClarification
            ? plannerParsed.clarificationQuestion || fallbackClarificationQuestion(commandRejections)
            : parsed.message;
          if (responseMessage !== parsed.message) controller.enqueue(streamEvent("replace", { text: responseMessage }));
          const commandModels = [];
          for (const requested of needsClarification ? [] : requestedCommands) {
            const needsApproval = commandRequiresApproval(contextData.project.aiCommandMode, requested.safety, requested.name);
            const inserted = await query(`INSERT INTO project_ai_commands (project_id,name,safety,mode,arguments,summary,request_message,status)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,safety,mode,arguments,summary,status,result,error,created_at AS "createdAt",decided_at AS "decidedAt"`,
              [id, requested.name, requested.safety, contextData.project.aiCommandMode, requested.arguments, requested.summary, body.message.trim(), needsApproval ? "pending" : "running"]);
            let command = toAICommandModel(inserted.rows[0]);
            controller.enqueue(streamEvent("activity", { command }));
            if (!needsApproval) {
              try {
                const result = await executeAICommand({ projectId: id, name: requested.name, arguments: requested.arguments });
                const applied = await query(`UPDATE project_ai_commands SET status='applied',result=$1,decided_at=NOW() WHERE id=$2
                  RETURNING id,name,safety,mode,arguments,summary,status,result,error,created_at AS "createdAt",decided_at AS "decidedAt"`, [result, command.id]);
                command = toAICommandModel(applied.rows[0]);
              } catch (commandError) {
                const failed = await query(`UPDATE project_ai_commands SET status='failed',error=$1,decided_at=NOW() WHERE id=$2
                  RETURNING id,name,safety,mode,arguments,summary,status,result,error,created_at AS "createdAt",decided_at AS "decidedAt"`, [commandError.message, command.id]);
                command = toAICommandModel(failed.rows[0]);
              }
            }
            commandModels.push(command);
          }
          const awaitingReview = commandModels.some((command) => command.status === "pending");
          controller.enqueue(streamEvent("workflow", {
            stage: needsClarification ? "complete" : awaitingReview ? "review" : "complete",
            label: needsClarification ? "Waiting for your answer" : awaitingReview ? "Waiting for your review" : "Workflow complete",
          }));
          const client = await getPool().connect();
          try {
            await client.query("BEGIN");
            const saved = await client.query(`INSERT INTO project_ai_messages (project_id, role, content)
              VALUES ($1, 'user', $2), ($1, 'assistant', $3)
              RETURNING id, role, content, created_at AS "createdAt"`, [id, body.message.trim(), responseMessage.slice(0, 20_000)]);
            await client.query("COMMIT");
            const savedMessages = [saved.rows.find((message) => message.role === "user"), saved.rows.find((message) => message.role === "assistant")].filter(Boolean);
            controller.enqueue(streamEvent("done", { messages: savedMessages, commands: commandModels, workflow: { intent: workflow.intent, scopes: workflow.scopes, stage: needsClarification ? "complete" : awaitingReview ? "review" : "complete" }, mode: contextData.project.aiCommandMode, provider: contextData.config.provider, model: contextData.config.model }));
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

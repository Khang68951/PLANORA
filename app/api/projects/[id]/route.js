import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { parseAIResult } from "@/lib/ai";
import { toAICommandModel } from "@/lib/ai-commands";
import { isUuid } from "@/lib/categories";
import { getPool, query } from "@/lib/db";
import { itemJoins, itemSelect, toItemModel } from "@/lib/items";
import { canPreviewFile, isAIReadableFile } from "@/lib/project-files";
import { projectSelect, toProjectModel, validateProject } from "@/lib/projects";

const projectFrom = `FROM projects project JOIN categories category ON category.id = project.category_id AND category.deleted_at IS NULL`;

export async function GET(_request, context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
    const [project, members, documents, files, items, messages, tools, commands] = await Promise.all([
      query(`SELECT ${projectSelect} ${projectFrom} WHERE project.id = $1 AND project.deleted_at IS NULL`, [id]),
      query(`SELECT id, name, role, created_at AS "createdAt", updated_at AS "updatedAt" FROM project_members WHERE project_id = $1 AND deleted_at IS NULL ORDER BY lower(name)`, [id]),
      query(`SELECT id, title, content_html AS "contentHtml", created_at AS "createdAt", updated_at AS "updatedAt" FROM project_documents WHERE project_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [id]),
      query(`SELECT id, original_name AS name, mime_type AS "mimeType", size_bytes::int AS "sizeBytes", created_at AS "createdAt" FROM project_files WHERE project_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`, [id]),
      query(`SELECT ${itemSelect} ${itemJoins} WHERE item.project_id = $1 AND item.deleted_at IS NULL ORDER BY COALESCE(item.start_at, item.due_at)`, [id]),
      query(`SELECT id, role, content, "createdAt" FROM (
        SELECT id, role, content, created_at AS "createdAt", created_at FROM project_ai_messages WHERE project_id = $1
        ORDER BY created_at DESC, CASE role WHEN 'assistant' THEN 0 ELSE 1 END LIMIT 40
      ) recent ORDER BY created_at, CASE role WHEN 'user' THEN 0 ELSE 1 END`, [id]),
      query(`SELECT id, name, prompt, created_at AS "createdAt" FROM project_ai_tools WHERE project_id = $1 ORDER BY lower(name)`, [id]),
      query(`SELECT id, name, safety, mode, arguments, summary, status, result, error,
        created_at AS "createdAt", decided_at AS "decidedAt" FROM project_ai_commands
        WHERE project_id = $1 ORDER BY created_at DESC LIMIT 40`, [id]),
    ]);
    if (!project.rowCount) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ project: toProjectModel(project.rows[0]), members: members.rows, documents: documents.rows, files: files.rows.map((file) => ({ ...file, previewable: canPreviewFile(file), aiReadable: isAIReadableFile(file) })), items: items.rows.map(toItemModel), messages: messages.rows.map((message) => message.role === "assistant" ? { ...message, content: parseAIResult(message.content).message } : message), tools: tools.rows, commands: commands.rows.map(toAICommandModel) });
  } catch (error) { console.error("GET /api/projects/:id", error); return NextResponse.json({ error: "Project workspace could not be loaded." }, { status: 500 }); }
}

export async function PATCH(request, context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
    const body = await request.json();
    const current = (await query(`SELECT title AS name, description, category_id AS "categoryId", project_type AS type, start_date::text AS "startDate", deadline::text, status, progress FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0];
    if (!current) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const candidate = { ...current, ...body };
    const errors = validateProject(candidate);
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the project.", errors }, { status: 400 });
    const updated = await query(`UPDATE projects SET title = $1, description = $2, category_id = $3, project_type = $4, start_date = $5, deadline = $6, status = $7, progress = $8, updated_at = NOW()
      WHERE id = $9 AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM categories WHERE id = $3 AND deleted_at IS NULL) RETURNING id`,
      [candidate.name.trim(), candidate.description?.trim() || null, candidate.categoryId, candidate.type, candidate.startDate || null, candidate.deadline || null, candidate.status, candidate.progress, id]);
    if (!updated.rowCount) return NextResponse.json({ error: "Choose an active category." }, { status: 400 });
    const result = await query(`SELECT ${projectSelect} ${projectFrom} WHERE project.id = $1`, [id]);
    return NextResponse.json({ project: toProjectModel(result.rows[0]) });
  } catch (error) { console.error("PATCH /api/projects/:id", error); return NextResponse.json({ error: "Project could not be updated." }, { status: 500 }); }
}

export async function DELETE(_request, context) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  const client = await getPool().connect();
  try {
    const batch = randomUUID();
    await client.query("BEGIN");
    const project = await client.query("UPDATE projects SET deleted_at = NOW(), trash_batch_id = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING id", [batch, id]);
    if (!project.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Project not found." }, { status: 404 }); }
    await client.query("UPDATE planner_items SET deleted_at = NOW(), trash_batch_id = $1, updated_at = NOW() WHERE project_id = $2 AND deleted_at IS NULL", [batch, id]);
    await client.query("COMMIT");
    return NextResponse.json({ trashed: true, batch });
  } catch (error) { await client.query("ROLLBACK"); console.error("DELETE /api/projects/:id", error); return NextResponse.json({ error: "Project could not be moved to Trash." }, { status: 500 }); }
  finally { client.release(); }
}

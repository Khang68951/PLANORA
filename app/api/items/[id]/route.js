import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { itemSelect, toItemModel, validateItem } from "@/lib/items";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";

const joins = `FROM planner_items item
  LEFT JOIN projects project ON project.id = item.project_id AND project.deleted_at IS NULL
  JOIN categories category_record ON category_record.id = COALESCE(project.category_id, item.category_id) AND category_record.deleted_at IS NULL`;

export async function PATCH(request, context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
    const body = await request.json();
    const allowed = ["title", "description", "kind", "startAt", "endAt", "dueAt", "categoryId", "projectId", "priority", "status"];
    if (!allowed.some((key) => Object.prototype.hasOwnProperty.call(body, key))) return NextResponse.json({ error: "No changes were provided." }, { status: 400 });

    const current = (await query(`SELECT title, description, kind,
      start_at AS "startAt", end_at AS "endAt", due_at AS "dueAt",
      category_id AS "categoryId", project_id AS "projectId", priority, status
      FROM planner_items WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0];
    if (!current) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });

    const candidate = { ...current, ...Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(body, key)).map((key) => [key, body[key]])) };
    if (candidate.kind === "task") candidate.dueAt = null;
    if (candidate.kind === "deadline") { candidate.startAt = null; candidate.endAt = null; }
    const errors = validateItem(candidate);
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the update.", errors }, { status: 400 });

    const category = await query("SELECT 1 FROM categories WHERE id = $1 AND deleted_at IS NULL", [candidate.categoryId]);
    if (!category.rowCount) return NextResponse.json({ error: "Choose an active category." }, { status: 400 });
    if (candidate.projectId) {
      const project = await query("SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL", [candidate.projectId]);
      if (!project.rowCount) return NextResponse.json({ error: "Choose an active project." }, { status: 400 });
    }

    const updated = await query(`UPDATE planner_items SET
      title = $1, description = $2, kind = $3, start_at = $4, end_at = $5, due_at = $6,
      category_id = $7, project_id = $8, priority = $9, status = $10, updated_at = NOW()
      WHERE id = $11 AND deleted_at IS NULL RETURNING id`, [
      candidate.title.trim(), candidate.description?.trim() || null, candidate.kind,
      candidate.kind === "task" ? new Date(candidate.startAt).toISOString() : null,
      candidate.kind === "task" ? new Date(candidate.endAt).toISOString() : null,
      candidate.kind === "deadline" ? new Date(candidate.dueAt).toISOString() : null,
      candidate.categoryId, candidate.projectId || null, candidate.priority, candidate.status, id,
    ]);
    if (!updated.rowCount) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });
    const result = await query(`SELECT ${itemSelect} ${joins} WHERE item.id = $1`, [id]);
    return NextResponse.json({ item: toItemModel(result.rows[0]) });
  } catch (error) { console.error("PATCH /api/items/:id", error); return NextResponse.json({ error: "The item could not be updated." }, { status: 500 }); }
}

export async function DELETE(_request, context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
    const result = await query("UPDATE planner_items SET deleted_at = NOW(), trash_batch_id = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING id", [randomUUID(), id]);
    if (!result.rowCount) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });
    return NextResponse.json({ trashed: true });
  } catch (error) { console.error("DELETE /api/items/:id", error); return NextResponse.json({ error: "The item could not be moved to Trash." }, { status: 500 }); }
}

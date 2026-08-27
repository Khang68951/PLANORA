import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { getPool, query } from "@/lib/db";
import { itemJoins, itemSelect, toItemModel, validateItem } from "@/lib/items";
import { replaceItemAssignees, validateAssigneeIds } from "@/lib/projects";
import { errorResponse, readJson } from "@/lib/http";

export async function PATCH(request, context) {
  const client = await getPool().connect();
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
    const body = await readJson(request);
    const allowed = ["title", "description", "kind", "startAt", "endAt", "dueAt", "categoryId", "projectId", "priority", "status", "assigneeIds"];
    if (!allowed.some((key) => Object.hasOwn(body, key))) return NextResponse.json({ error: "No changes were provided." }, { status: 400 });
    await client.query("BEGIN");
    const current = (await client.query(`SELECT title, description, kind, start_at AS "startAt", end_at AS "endAt", due_at AS "dueAt", category_id AS "categoryId", project_id AS "projectId", priority, status,
      COALESCE((SELECT json_agg(member_id) FROM planner_item_assignees WHERE item_id = planner_items.id), '[]'::json) AS "assigneeIds",
      updated_at AS "updatedAt" FROM planner_items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id])).rows[0];
    if (!current) { await client.query("ROLLBACK"); return NextResponse.json({ error: "That item no longer exists." }, { status: 404 }); }
    if (body.expectedUpdatedAt && new Date(body.expectedUpdatedAt).getTime() !== new Date(current.updatedAt).getTime()) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This item changed elsewhere. Reload it before saving.", code: "STALE_WRITE" }, { status: 409 });
    }
    const candidate = { ...current, ...Object.fromEntries(allowed.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]])) };
    if (candidate.kind === "task") candidate.dueAt = null;
    if (candidate.kind === "deadline") { candidate.startAt = null; candidate.endAt = null; }
    const errors = validateItem(candidate);
    if (!validateAssigneeIds(candidate.assigneeIds)) errors.assigneeIds = "Choose valid project members.";
    if (Object.keys(errors).length) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Please check the update.", errors }, { status: 400 }); }
    if (!(await client.query("SELECT 1 FROM categories WHERE id = $1 AND deleted_at IS NULL", [candidate.categoryId])).rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Choose an active category." }, { status: 400 }); }
    if (candidate.projectId && !(await client.query("SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL", [candidate.projectId])).rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Choose an active project." }, { status: 400 }); }
    await client.query(`UPDATE planner_items SET title=$1, description=$2, kind=$3, start_at=$4, end_at=$5, due_at=$6, category_id=$7, project_id=$8, priority=$9, status=$10, updated_at=NOW() WHERE id=$11 AND deleted_at IS NULL`, [
      candidate.title.trim(), candidate.description?.trim() || null, candidate.kind,
      candidate.kind === "task" ? new Date(candidate.startAt).toISOString() : null, candidate.kind === "task" ? new Date(candidate.endAt).toISOString() : null,
      candidate.kind === "deadline" ? new Date(candidate.dueAt).toISOString() : null, candidate.categoryId, candidate.projectId || null, candidate.priority, candidate.status, id]);
    if (!await replaceItemAssignees(client, id, candidate.projectId || null, candidate.assigneeIds)) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Assignees must belong to the selected project." }, { status: 400 }); }
    const result = await client.query(`SELECT ${itemSelect} ${itemJoins} WHERE item.id = $1`, [id]);
    await client.query("COMMIT");
    return NextResponse.json({ item: toItemModel(result.rows[0]) });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); return errorResponse(error, "The item could not be updated."); }
  finally { client.release(); }
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

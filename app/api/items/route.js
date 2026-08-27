import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { itemJoins, itemSelect, toItemModel, validateItem } from "@/lib/items";
import { replaceItemAssignees, validateAssigneeIds } from "@/lib/projects";
import { buildItemQuery } from "@/lib/item-query";
import { errorResponse, readJson, RequestValidationError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const client = await getPool().connect();
  try {
    const queryOptions = buildItemQuery(new URL(request.url).searchParams);
    if (Object.keys(queryOptions.errors).length) throw new RequestValidationError("Please check the item filters.", queryOptions.errors);
    const count = await client.query(`SELECT COUNT(*)::int AS total ${itemJoins} WHERE ${queryOptions.where}`, queryOptions.values);
    const values = [...queryOptions.values, queryOptions.limit, (queryOptions.page - 1) * queryOptions.limit];
    const result = await client.query(`SELECT ${itemSelect} ${itemJoins} WHERE ${queryOptions.where} ORDER BY ${queryOptions.orderBy} LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    const total = count.rows[0].total;
    return NextResponse.json({ items: result.rows.map(toItemModel), pagination: { page: queryOptions.page, limit: queryOptions.limit, total, pages: Math.ceil(total / queryOptions.limit) } });
  } catch (error) {
    if (error instanceof RequestValidationError) return errorResponse(error);
    console.error("GET /api/items", error);
    return NextResponse.json({ error: "Planora cannot load planner data. Run npm run db:setup and check the server terminal." }, { status: 503 });
  }
  finally { client.release(); }
}

export async function POST(request) {
  const client = await getPool().connect();
  try {
    const body = await readJson(request);
    const errors = validateItem(body);
    if (body.assigneeIds !== undefined && !validateAssigneeIds(body.assigneeIds)) errors.assigneeIds = "Choose valid project members.";
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the form.", errors }, { status: 400 });
    await client.query("BEGIN");
    const categoryId = body.categoryId || (await client.query("SELECT default_category_id FROM planner_settings WHERE id = 1")).rows[0]?.default_category_id;
    if (!categoryId || !(await client.query("SELECT 1 FROM categories WHERE id = $1 AND deleted_at IS NULL", [categoryId])).rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Choose an active category." }, { status: 400 }); }
    if (body.projectId && !(await client.query("SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL", [body.projectId])).rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Choose an active project." }, { status: 400 }); }
    const inserted = await client.query(`INSERT INTO planner_items (title, description, kind, start_at, end_at, due_at, category_id, project_id, priority, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [body.title.trim(), body.description?.trim() || null, body.kind,
      body.kind === "task" ? new Date(body.startAt).toISOString() : null, body.kind === "task" ? new Date(body.endAt).toISOString() : null,
      body.kind === "deadline" ? new Date(body.dueAt).toISOString() : null, categoryId, body.projectId || null, body.priority || "medium", body.status || "pending"]);
    if (!await replaceItemAssignees(client, inserted.rows[0].id, body.projectId || null, body.assigneeIds || [])) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Assignees must belong to the selected project." }, { status: 400 }); }
    const result = await client.query(`SELECT ${itemSelect} ${itemJoins} WHERE item.id = $1`, [inserted.rows[0].id]);
    await client.query("COMMIT");
    return NextResponse.json({ item: toItemModel(result.rows[0]) }, { status: 201 });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); return errorResponse(error, "The item could not be saved."); }
  finally { client.release(); }
}

import { NextResponse } from "next/server";
import { itemSelect, toItemModel, validateItem } from "@/lib/items";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
const joins = `FROM planner_items item
  LEFT JOIN projects project ON project.id = item.project_id AND project.deleted_at IS NULL
  JOIN categories category_record ON category_record.id = COALESCE(project.category_id, item.category_id) AND category_record.deleted_at IS NULL`;

export async function GET() {
  try {
    const result = await query(`SELECT ${itemSelect} ${joins} WHERE item.deleted_at IS NULL ORDER BY COALESCE(item.start_at, item.due_at) ASC`);
    return NextResponse.json({ items: result.rows.map(toItemModel) });
  } catch (error) {
    console.error("GET /api/items", error);
    return NextResponse.json({ error: "Planora cannot load planner data. Run npm run db:setup and check the server terminal." }, { status: 503 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const errors = validateItem(body);
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the form.", errors }, { status: 400 });
    const categoryId = body.categoryId || (await query("SELECT default_category_id FROM planner_settings WHERE id = 1")).rows[0]?.default_category_id;
    if (!categoryId) return NextResponse.json({ error: "Configure a default category first." }, { status: 400 });
    const validCategory = await query("SELECT 1 FROM categories WHERE id = $1 AND deleted_at IS NULL", [categoryId]);
    if (!validCategory.rowCount) return NextResponse.json({ error: "Choose an active category." }, { status: 400 });
    if (body.projectId) {
      const project = await query("SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL", [body.projectId]);
      if (!project.rowCount) return NextResponse.json({ error: "Choose an active project." }, { status: 400 });
    }
    const inserted = await query(
      `INSERT INTO planner_items (title, description, kind, start_at, end_at, due_at, category_id, project_id, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        body.title.trim(), body.description?.trim() || null, body.kind,
        body.kind === "task" ? new Date(body.startAt).toISOString() : null,
        body.kind === "task" ? new Date(body.endAt).toISOString() : null,
        body.kind === "deadline" ? new Date(body.dueAt).toISOString() : null,
        categoryId, body.projectId || null, body.priority || "medium", body.status || "pending",
      ],
    );
    const result = await query(`SELECT ${itemSelect} ${joins} WHERE item.id = $1`, [inserted.rows[0].id]);
    return NextResponse.json({ item: toItemModel(result.rows[0]) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/items", error);
    return NextResponse.json({ error: "The item could not be saved." }, { status: 500 });
  }
}

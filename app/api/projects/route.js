import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const result = await query(`SELECT project.id, project.title, project.category_id, category.name category_name, category.color category_color
      FROM projects project JOIN categories category ON category.id = project.category_id
      WHERE project.deleted_at IS NULL AND category.deleted_at IS NULL ORDER BY lower(project.title)`);
    return NextResponse.json({ projects: result.rows });
  } catch (error) { console.error("GET /api/projects", error); return NextResponse.json({ error: "Projects could not be loaded." }, { status: 500 }); }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120 || !isUuid(body.category_id)) return NextResponse.json({ error: "Enter a title and valid category." }, { status: 400 });
    const result = await query("INSERT INTO projects (title, category_id) SELECT $1, id FROM categories WHERE id = $2 AND deleted_at IS NULL RETURNING id, title, category_id", [body.title.trim(), body.category_id]);
    if (!result.rowCount) return NextResponse.json({ error: "Category not found." }, { status: 400 });
    return NextResponse.json({ project: result.rows[0] }, { status: 201 });
  } catch (error) { console.error("POST /api/projects", error); return NextResponse.json({ error: "Project could not be created." }, { status: 500 }); }
}

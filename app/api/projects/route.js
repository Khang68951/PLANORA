import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { projectSelect, toProjectModel, validateProject } from "@/lib/projects";

const from = `FROM projects project JOIN categories category ON category.id = project.category_id AND category.deleted_at IS NULL`;

export async function GET() {
  try {
    const result = await query(`SELECT ${projectSelect},
      (SELECT COUNT(*)::int FROM project_members WHERE project_id = project.id) AS "memberCount",
      (SELECT COUNT(*)::int FROM planner_items WHERE project_id = project.id AND deleted_at IS NULL) AS "itemCount"
      ${from} WHERE project.deleted_at IS NULL ORDER BY lower(project.title)`);
    return NextResponse.json({ projects: result.rows.map((row) => ({ ...toProjectModel(row), memberCount: row.memberCount, itemCount: row.itemCount })) });
  } catch (error) { console.error("GET /api/projects", error); return NextResponse.json({ error: "Projects could not be loaded." }, { status: 500 }); }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const candidate = { ...body, type: body.type || "other", status: body.status || "active", progress: body.progress ?? 0 };
    const errors = validateProject(candidate);
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the project.", errors }, { status: 400 });
    const result = await query(`INSERT INTO projects (title, description, category_id, project_type, start_date, deadline, status, progress)
      SELECT $1, $2, id, $4, $5, $6, $7, $8 FROM categories WHERE id = $3 AND deleted_at IS NULL RETURNING id`,
      [candidate.name.trim(), candidate.description?.trim() || null, candidate.categoryId, candidate.type, candidate.startDate || null, candidate.deadline || null, candidate.status, candidate.progress]);
    if (!result.rowCount) return NextResponse.json({ error: "Choose an active category." }, { status: 400 });
    const project = await query(`SELECT ${projectSelect} ${from} WHERE project.id = $1`, [result.rows[0].id]);
    return NextResponse.json({ project: toProjectModel(project.rows[0]) }, { status: 201 });
  } catch (error) { console.error("POST /api/projects", error); return NextResponse.json({ error: "Project could not be created." }, { status: 500 }); }
}

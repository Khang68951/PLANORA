import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";
import { validateMember } from "@/lib/projects";

export async function POST(request, context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
    const body = await request.json();
    const errors = validateMember(body);
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the member.", errors }, { status: 400 });
    const result = await query(`INSERT INTO project_members (project_id, name, role)
      SELECT id, $2, $3 FROM projects WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, name, role, created_at AS "createdAt", updated_at AS "updatedAt"`, [id, body.name.trim(), body.role?.trim() || null]);
    if (!result.rowCount) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ member: result.rows[0] }, { status: 201 });
  } catch (error) { console.error("POST /api/projects/:id/members", error); return NextResponse.json({ error: "Member could not be added." }, { status: 500 }); }
}

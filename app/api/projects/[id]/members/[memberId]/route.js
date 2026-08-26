import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";
import { validateMember } from "@/lib/projects";

export async function PATCH(request, context) {
  try {
    const { id, memberId } = await context.params;
    if (!isUuid(id) || !isUuid(memberId)) return NextResponse.json({ error: "Invalid member." }, { status: 400 });
    const current = (await query("SELECT name, role FROM project_members WHERE id = $1 AND project_id = $2", [memberId, id])).rows[0];
    if (!current) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    const candidate = { ...current, ...await request.json() };
    const errors = validateMember(candidate);
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the member.", errors }, { status: 400 });
    const result = await query(`UPDATE project_members SET name = $1, role = $2, updated_at = NOW() WHERE id = $3 AND project_id = $4
      RETURNING id, name, role, created_at AS "createdAt", updated_at AS "updatedAt"`, [candidate.name.trim(), candidate.role?.trim() || null, memberId, id]);
    return NextResponse.json({ member: result.rows[0] });
  } catch (error) { console.error("PATCH project member", error); return NextResponse.json({ error: "Member could not be updated." }, { status: 500 }); }
}

export async function DELETE(_request, context) {
  try {
    const { id, memberId } = await context.params;
    if (!isUuid(id) || !isUuid(memberId)) return NextResponse.json({ error: "Invalid member." }, { status: 400 });
    const result = await query("DELETE FROM project_members WHERE id = $1 AND project_id = $2 RETURNING id", [memberId, id]);
    if (!result.rowCount) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) { console.error("DELETE project member", error); return NextResponse.json({ error: "Member could not be removed." }, { status: 500 }); }
}

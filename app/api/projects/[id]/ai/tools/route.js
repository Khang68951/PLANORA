import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";

export async function POST(request, context) {
  try {
    const { id } = await context.params; const body = await request.json();
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 60 || typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.trim().length > 2000) return NextResponse.json({ error: "Enter a tool name and prompt within the limits." }, { status: 400 });
    const result = await query(`INSERT INTO project_ai_tools (project_id, name, prompt) SELECT id, $2, $3 FROM projects WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, name, prompt, created_at AS "createdAt"`, [id, body.name.trim(), body.prompt.trim()]);
    if (!result.rowCount) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ tool: result.rows[0] }, { status: 201 });
  } catch (error) { console.error("POST project AI tool", error); return NextResponse.json({ error: error.code === "23505" ? "A tool with that name already exists." : "AI tool could not be created." }, { status: error.code === "23505" ? 409 : 500 }); }
}

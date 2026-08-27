import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";
export async function DELETE(_request, context) {
  try {
    const { id, toolId } = await context.params;
    if (!isUuid(id) || !isUuid(toolId)) return NextResponse.json({ error: "Invalid AI tool." }, { status: 400 });
    const result = await query("DELETE FROM project_ai_tools WHERE id = $1 AND project_id = $2 RETURNING id", [toolId, id]);
    if (!result.rowCount) return NextResponse.json({ error: "AI tool not found." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) { console.error("DELETE project AI tool", error); return NextResponse.json({ error: "AI tool could not be deleted." }, { status: 500 }); }
}

import { NextResponse } from "next/server";
import { AI_COMMAND_MODES } from "@/lib/ai-commands";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";

export async function PATCH(request, context) {
  try {
    const { id } = await context.params; const body = await request.json();
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
    if (!AI_COMMAND_MODES.includes(body.mode)) return NextResponse.json({ error: "Choose a valid AI command mode." }, { status: 400 });
    const result = await query("UPDATE projects SET ai_command_mode=$1, updated_at=NOW() WHERE id=$2 AND deleted_at IS NULL RETURNING ai_command_mode AS mode", [body.mode, id]);
    if (!result.rowCount) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ mode: result.rows[0].mode });
  } catch (error) { console.error("PATCH project AI mode", error); return NextResponse.json({ error: "AI command mode could not be saved." }, { status: 500 }); }
}

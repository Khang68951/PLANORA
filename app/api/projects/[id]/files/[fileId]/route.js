import { unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";
import { storagePath } from "@/lib/project-files";
export const runtime = "nodejs";
export async function DELETE(_request, context) {
  try {
    const { id, fileId } = await context.params;
    if (!isUuid(id) || !isUuid(fileId)) return NextResponse.json({ error: "Invalid file." }, { status: 400 });
    const result = await query("DELETE FROM project_files WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL RETURNING stored_name", [fileId, id]);
    if (!result.rowCount) return NextResponse.json({ error: "File not found." }, { status: 404 });
    await unlink(storagePath(id, result.rows[0].stored_name).target).catch((error) => { if (error.code !== "ENOENT") throw error; });
    return NextResponse.json({ deleted: true });
  } catch (error) { console.error("DELETE project file", error); return NextResponse.json({ error: "File could not be deleted." }, { status: 500 }); }
}

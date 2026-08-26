import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";
import { safeOriginalName, storagePath } from "@/lib/project-files";
export const runtime = "nodejs";
export async function GET(_request, context) {
  try {
    const { id, fileId } = await context.params;
    if (!isUuid(id) || !isUuid(fileId)) return NextResponse.json({ error: "Invalid file." }, { status: 400 });
    const file = (await query("SELECT original_name, stored_name, mime_type FROM project_files WHERE id = $1 AND project_id = $2", [fileId, id])).rows[0];
    if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
    const content = await readFile(storagePath(id, file.stored_name).target);
    return new Response(content, { headers: { "Content-Type": file.mime_type, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(safeOriginalName(file.original_name))}`, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { console.error("GET project file content", error); return NextResponse.json({ error: error.code === "ENOENT" ? "The local file is missing." : "File could not be opened." }, { status: error.code === "ENOENT" ? 404 : 500 }); }
}

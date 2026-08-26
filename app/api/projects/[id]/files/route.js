import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";
import { MAX_PROJECT_FILE_BYTES, canPreviewFile, isAIReadableFile, safeOriginalName, storagePath, storedFileName } from "@/lib/project-files";
export const runtime = "nodejs";

export async function POST(request, context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
    if (!(await query("SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL", [id])).rowCount) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    if (!file.size || file.size > MAX_PROJECT_FILE_BYTES) return NextResponse.json({ error: "Files must be between 1 byte and 10 MB." }, { status: 400 });
    const fileId = randomUUID(); const name = safeOriginalName(file.name); const storedName = storedFileName(fileId, name);
    const { projectRoot, target } = storagePath(id, storedName);
    await mkdir(projectRoot, { recursive: true });
    await writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
    try {
      const result = await query(`INSERT INTO project_files (id, project_id, original_name, stored_name, mime_type, size_bytes) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, original_name AS name, mime_type AS "mimeType", size_bytes::int AS "sizeBytes", created_at AS "createdAt"`, [fileId, id, name, storedName, file.type || "application/octet-stream", file.size]);
      const saved = result.rows[0];
      return NextResponse.json({ file: { ...saved, previewable: canPreviewFile(saved), aiReadable: isAIReadableFile(saved) } }, { status: 201 });
    } catch (error) { await unlink(target).catch(() => {}); throw error; }
  } catch (error) { console.error("POST project file", error); return NextResponse.json({ error: "File could not be uploaded." }, { status: 500 }); }
}

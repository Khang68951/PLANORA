import { unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { getPool } from "@/lib/db";
import { storagePath } from "@/lib/project-files";
import { purgeTrashBatchRecords } from "@/lib/trash";

export const runtime = "nodejs";

export async function DELETE(_request, context) {
  const { batch } = await context.params;
  if (!isUuid(batch)) return NextResponse.json({ error: "Invalid Trash batch." }, { status: 400 });

  const client = await getPool().connect();
  try {
    const result = await purgeTrashBatchRecords({ client, batch });
    if (!result) return NextResponse.json({ error: "Trash batch not found." }, { status: 404 });

    const cleanupResults = await Promise.allSettled(result.files.map((file) =>
      unlink(storagePath(file.project_id, file.stored_name).target),
    ));
    cleanupResults.forEach((cleanup, index) => {
      if (cleanup.status === "rejected" && cleanup.reason?.code !== "ENOENT") {
        console.error("Permanent Trash attachment cleanup", result.files[index], cleanup.reason);
      }
    });
    const cleanupFailures = cleanupResults.filter((cleanup) => cleanup.status === "rejected" && cleanup.reason?.code !== "ENOENT").length;
    return NextResponse.json({
      permanentlyDeleted: result.deleted,
      warning: cleanupFailures ? `${cleanupFailures} local attachment file${cleanupFailures === 1 ? "" : "s"} could not be removed. Check the server log.` : null,
    });
  } catch (error) {
    console.error("DELETE /api/trash/:batch", error);
    const conflict = error.code === "23503";
    return NextResponse.json({
      error: conflict
        ? "This Trash group is still referenced by other records and could not be permanently deleted."
        : "This Trash group could not be permanently deleted.",
    }, { status: conflict ? 409 : 500 });
  } finally {
    client.release();
  }
}

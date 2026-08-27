import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { getPool } from "@/lib/db";

export async function POST(_request, context) {
  const { batch } = await context.params;
  if (!isUuid(batch)) return NextResponse.json({ error: "Invalid Trash batch." }, { status: 400 });

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const categories = await client.query("UPDATE categories SET deleted_at = NULL, trash_batch_id = NULL, updated_at = NOW() WHERE trash_batch_id = $1 RETURNING id", [batch]);
    const projects = await client.query("UPDATE projects SET deleted_at = NULL, trash_batch_id = NULL, updated_at = NOW() WHERE trash_batch_id = $1 RETURNING id", [batch]);
    const items = await client.query("UPDATE planner_items SET deleted_at = NULL, trash_batch_id = NULL, updated_at = NOW() WHERE trash_batch_id = $1 RETURNING id", [batch]);
    if (!categories.rowCount && !projects.rowCount && !items.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Trash batch not found." }, { status: 404 });
    }
    await client.query("COMMIT");
    return NextResponse.json({ restored: { categories: categories.rowCount, projects: projects.rowCount, items: items.rowCount } });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST /api/trash/:batch/restore", error);
    const conflict = error.code === "23505";
    return NextResponse.json({ error: conflict ? "A category with the same name now exists in that folder. Rename or remove it before restoring this batch." : "The Trash batch could not be restored." }, { status: conflict ? 409 : 500 });
  } finally {
    client.release();
  }
}

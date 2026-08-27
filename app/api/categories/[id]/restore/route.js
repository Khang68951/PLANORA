import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { getPool, query } from "@/lib/db";

export async function POST(_request, context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    const category = (await query("SELECT trash_batch_id FROM categories WHERE id = $1 AND deleted_at IS NOT NULL", [id])).rows[0];
    if (!category) return NextResponse.json({ error: "Trashed category not found." }, { status: 404 });
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE categories SET deleted_at = NULL, trash_batch_id = NULL, updated_at = NOW() WHERE trash_batch_id = $1", [category.trash_batch_id]);
      await client.query("UPDATE projects SET deleted_at = NULL, trash_batch_id = NULL, updated_at = NOW() WHERE trash_batch_id = $1", [category.trash_batch_id]);
      await client.query("UPDATE planner_items SET deleted_at = NULL, trash_batch_id = NULL, updated_at = NOW() WHERE trash_batch_id = $1", [category.trash_batch_id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    return NextResponse.json({ restored: true });
  } catch (error) {
    console.error("POST /api/categories/:id/restore", error);
    const conflict = error.code === "23505";
    return NextResponse.json({ error: conflict ? "A category with the same name now exists in that folder." : "The category could not be restored." }, { status: conflict ? 409 : 500 });
  }
}

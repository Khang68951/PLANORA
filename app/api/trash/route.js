import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [categories, items, projects] = await Promise.all([
      query("SELECT id, name, color, parent_id, deleted_at, trash_batch_id FROM categories WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"),
      query("SELECT id, title, kind, deleted_at, trash_batch_id FROM planner_items WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"),
      query("SELECT id, title, deleted_at, trash_batch_id FROM projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"),
    ]);
    return NextResponse.json({ categories: categories.rows, items: items.rows, projects: projects.rows });
  } catch (error) {
    console.error("GET /api/trash", error);
    return NextResponse.json({ error: "Trash could not be loaded." }, { status: 500 });
  }
}

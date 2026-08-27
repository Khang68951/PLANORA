import { NextResponse } from "next/server";
import { suggestCategories } from "@/lib/categories";
import { query } from "@/lib/db";

export async function POST(request) {
  try {
    const body = await request.json();
    if (typeof body.title !== "string" || body.title.length > 120 || typeof (body.description || "") !== "string" || (body.description || "").length > 1000) return NextResponse.json({ error: "Provide a title and optional description." }, { status: 400 });
    const categories = (await query("SELECT id, name, color, is_hidden, deleted_at FROM categories WHERE deleted_at IS NULL")).rows;
    const examples = (await query(`SELECT item.title, item.description, COALESCE(project.category_id, item.category_id) AS category_id
      FROM planner_items item LEFT JOIN projects project ON project.id = item.project_id AND project.deleted_at IS NULL
      WHERE item.deleted_at IS NULL ORDER BY item.created_at DESC LIMIT 200`)).rows;
    return NextResponse.json({ suggestions: suggestCategories({ title: body.title, description: body.description, categories, examples }) });
  } catch (error) {
    console.error("POST /api/categories/suggest", error);
    return NextResponse.json({ error: "Suggestions are unavailable right now." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { DEFAULT_CATEGORY_COLOR, validateCategory } from "@/lib/categories";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const includeTrash = new URL(request.url).searchParams.get("trash") === "true";
    const result = await query(
      `SELECT id, name, color, parent_id, is_hidden, deleted_at, created_at, updated_at
       FROM categories WHERE deleted_at IS ${includeTrash ? "NOT NULL" : "NULL"}
       ORDER BY lower(name)`,
    );
    const settings = await query("SELECT default_category_id, max_category_depth FROM planner_settings WHERE id = 1");
    return NextResponse.json({ categories: result.rows, settings: settings.rows[0] });
  } catch (error) {
    console.error("GET /api/categories", error);
    return NextResponse.json({ error: "Categories could not be loaded." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const errors = validateCategory(body);
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the category.", errors }, { status: 400 });

    let depth = 1;
    if (body.parent_id) {
      const parent = await query("SELECT 1 FROM categories WHERE id = $1 AND deleted_at IS NULL", [body.parent_id]);
      if (!parent.rowCount) return NextResponse.json({ error: "Choose an active parent category." }, { status: 400 });
      depth = Number((await query(
          `WITH RECURSIVE ancestors AS (
             SELECT id, parent_id, 1 AS depth FROM categories WHERE id = $1 AND deleted_at IS NULL
             UNION ALL SELECT category.id, category.parent_id, ancestors.depth + 1
             FROM categories category JOIN ancestors ON category.id = ancestors.parent_id
             WHERE category.deleted_at IS NULL
           ) SELECT COALESCE(MAX(depth), 0) + 1 AS depth FROM ancestors`,
          [body.parent_id],
        )).rows[0].depth);
    }
    const maximum = Number((await query("SELECT max_category_depth FROM planner_settings WHERE id = 1")).rows[0].max_category_depth);
    if (depth > maximum) return NextResponse.json({ error: `Categories can be nested up to ${maximum} levels.` }, { status: 400 });

    const result = await query(
      `INSERT INTO categories (name, color, parent_id, is_hidden) VALUES ($1, $2, $3, $4)
       RETURNING id, name, color, parent_id, is_hidden, deleted_at, created_at, updated_at`,
      [body.name.trim(), body.color || DEFAULT_CATEGORY_COLOR, body.parent_id || null, body.is_hidden || false],
    );
    return NextResponse.json({ category: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error("POST /api/categories", error);
    const message = error.code === "23505" ? "A category with that name already exists in this folder." : "The category could not be created.";
    return NextResponse.json({ error: message }, { status: error.code === "23505" ? 409 : 500 });
  }
}

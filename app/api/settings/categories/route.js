import { NextResponse } from "next/server";
import { validateSettings } from "@/lib/categories";
import { query } from "@/lib/db";

export async function PATCH(request) {
  try {
    const body = await request.json();
    const errors = validateSettings(body);
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the settings.", errors }, { status: 400 });
    const entries = ["default_category_id", "max_category_depth"].filter((key) => body[key] !== undefined);
    if (!entries.length) return NextResponse.json({ error: "No settings were provided." }, { status: 400 });
    if (body.default_category_id) {
      const exists = await query("SELECT 1 FROM categories WHERE id = $1 AND deleted_at IS NULL", [body.default_category_id]);
      if (!exists.rowCount) return NextResponse.json({ error: "The default category must be active." }, { status: 400 });
    }
    if (body.max_category_depth) {
      const depth = Number((await query(`WITH RECURSIVE tree AS (
        SELECT id, parent_id, 1 depth FROM categories WHERE parent_id IS NULL AND deleted_at IS NULL
        UNION ALL SELECT category.id, category.parent_id, tree.depth + 1 FROM categories category JOIN tree ON category.parent_id = tree.id WHERE category.deleted_at IS NULL
      ) SELECT COALESCE(MAX(depth), 1) depth FROM tree`)).rows[0].depth);
      if (body.max_category_depth < depth) return NextResponse.json({ error: `Existing categories already use ${depth} levels.` }, { status: 400 });
    }
    const values = entries.map((key) => body[key]);
    const result = await query(
      `UPDATE planner_settings SET ${entries.map((key, index) => `${key} = $${index + 1}`).join(", ")}, updated_at = NOW() WHERE id = 1
       RETURNING default_category_id, max_category_depth`, values,
    );
    return NextResponse.json({ settings: result.rows[0] });
  } catch (error) {
    console.error("PATCH /api/settings/categories", error);
    return NextResponse.json({ error: "Category settings could not be saved." }, { status: 500 });
  }
}

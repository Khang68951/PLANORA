import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { descendantsOf, isUuid, validateCategory } from "@/lib/categories";
import { getPool, query } from "@/lib/db";
import { reassignCategoryAndTrash } from "@/lib/category-deletion";
import { errorResponse, readOptionalJson, RequestValidationError } from "@/lib/http";

async function activeCategories() {
  return (await query("SELECT id, parent_id FROM categories WHERE deleted_at IS NULL")).rows;
}

function depthFor(categories, id) {
  let depth = 0;
  let cursor = id;
  const seen = new Set();
  while (cursor) {
    if (seen.has(cursor)) return Infinity;
    seen.add(cursor);
    const category = categories.find((item) => item.id === cursor);
    if (!category) return depth;
    depth += 1;
    cursor = category.parent_id;
  }
  return depth;
}

export async function PATCH(request, context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    const body = await request.json();
    const errors = validateCategory(body, { partial: true });
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the category.", errors }, { status: 400 });
    const entries = ["name", "color", "parent_id", "is_hidden"].filter((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (!entries.length) return NextResponse.json({ error: "No changes were provided." }, { status: 400 });

    if (Object.prototype.hasOwnProperty.call(body, "parent_id")) {
      const categories = await activeCategories();
      if (body.parent_id && !categories.some((category) => category.id === body.parent_id)) return NextResponse.json({ error: "Choose an active parent category." }, { status: 400 });
      const descendants = descendantsOf(categories, id);
      if (body.parent_id && descendants.has(body.parent_id)) return NextResponse.json({ error: "A category cannot be moved inside itself or one of its children." }, { status: 400 });
      const subtreeDepth = Math.max(...[...descendants].map((childId) => depthFor(categories.filter((item) => descendants.has(item.id)), childId)), 1);
      const parentDepth = body.parent_id ? depthFor(categories, body.parent_id) : 0;
      const maximum = Number((await query("SELECT max_category_depth FROM planner_settings WHERE id = 1")).rows[0].max_category_depth);
      if (parentDepth + subtreeDepth > maximum) return NextResponse.json({ error: `That move would exceed the ${maximum}-level nesting limit.` }, { status: 400 });
    }

    const values = entries.map((key) => key === "name" ? body[key].trim() : body[key]);
    values.push(id);
    const result = await query(
      `UPDATE categories SET ${entries.map((key, index) => `${key} = $${index + 1}`).join(", ")}, updated_at = NOW()
       WHERE id = $${values.length} AND deleted_at IS NULL
       RETURNING id, name, color, parent_id, is_hidden, deleted_at, created_at, updated_at`,
      values,
    );
    if (!result.rowCount) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json({ category: result.rows[0] });
  } catch (error) {
    console.error("PATCH /api/categories/:id", error);
    return NextResponse.json({ error: error.code === "23505" ? "That folder already has a category with this name." : "The category could not be updated." }, { status: error.code === "23505" ? 409 : 500 });
  }
}

async function impactFor(id) {
  return (await query(
    `WITH RECURSIVE tree AS (
       SELECT id FROM categories WHERE id = $1 AND deleted_at IS NULL
       UNION ALL SELECT category.id FROM categories category JOIN tree ON category.parent_id = tree.id WHERE category.deleted_at IS NULL
     ) SELECT
       (SELECT COUNT(*) FROM tree)::int AS categories,
       (SELECT COUNT(*) FROM projects WHERE category_id IN (SELECT id FROM tree) AND deleted_at IS NULL)::int AS projects,
       (SELECT COUNT(*) FROM planner_items
          WHERE deleted_at IS NULL AND project_id IS NULL AND category_id IN (SELECT id FROM tree))::int AS items,
       EXISTS(SELECT 1 FROM planner_settings WHERE default_category_id IN (SELECT id FROM tree)) AS contains_default`,
    [id],
  )).rows[0];
}

export async function DELETE(request, context) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  try {
    const body = await readOptionalJson(request);
    if (body.replacement_category_id && !isUuid(body.replacement_category_id)) return NextResponse.json({ error: "Choose a valid replacement category." }, { status: 400 });
    const impact = await impactFor(id);
    if (!impact.categories) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    if (!body.confirm) return NextResponse.json({ impact }, { status: 409 });
    const tree = await activeCategories();
    const ids = [...descendantsOf(tree, id)];
    const configuredDefault = (await query("SELECT default_category_id FROM planner_settings WHERE id = 1")).rows[0]?.default_category_id;
    const replacementCategoryId = body.replacement_category_id || (ids.includes(configuredDefault) ? null : configuredDefault);
    if (!replacementCategoryId) return NextResponse.json({ error: "Choose a replacement category so existing work stays organized.", impact }, { status: 400 });
    if (ids.includes(replacementCategoryId)) return NextResponse.json({ error: "The replacement category must be outside the folder being deleted." }, { status: 400 });
    const replacement = await query("SELECT 1 FROM categories WHERE id = $1 AND deleted_at IS NULL", [replacementCategoryId]);
    if (!replacement.rowCount) return NextResponse.json({ error: "Choose an active replacement category." }, { status: 400 });
    const batch = randomUUID();
    const client = await getPool().connect();
    try {
      await reassignCategoryAndTrash({ client, categoryIds: ids, replacementCategoryId, trashBatchId: batch, replaceDefault: impact.contains_default });
    } finally { client.release(); }
    return NextResponse.json({ trashed: true, impact, batch, replacement_category_id: replacementCategoryId });
  } catch (error) {
    if (error instanceof RequestValidationError) return errorResponse(error);
    console.error("DELETE /api/categories/:id", error);
    return NextResponse.json({ error: "The category could not be moved to Trash." }, { status: 500 });
  }
}

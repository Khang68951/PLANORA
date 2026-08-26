import { NextResponse } from "next/server";
import { itemColumns, validateItem } from "@/lib/items";
import { query } from "@/lib/db";

export async function PATCH(request, context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const errors = validateItem(body, { partial: true });
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the update.", errors }, { status: 400 });

    const allowed = ["title", "description", "kind", "due_at", "category", "priority", "status"];
    const entries = allowed.filter((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (!entries.length) return NextResponse.json({ error: "No changes were provided." }, { status: 400 });

    const values = entries.map((key) => {
      if (key === "due_at") return new Date(body[key]).toISOString();
      if (typeof body[key] === "string") return body[key].trim();
      return body[key];
    });
    const assignments = entries.map((key, index) => `${key} = $${index + 1}`).join(", ");
    values.push(id);

    const result = await query(
      `UPDATE planner_items SET ${assignments}, updated_at = NOW()
       WHERE id = $${values.length} RETURNING ${itemColumns}`,
      values,
    );
    if (!result.rowCount) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });
    return NextResponse.json({ item: result.rows[0] });
  } catch (error) {
    console.error("PATCH /api/items/:id", error);
    return NextResponse.json({ error: "The item could not be updated." }, { status: 500 });
  }
}

export async function DELETE(_request, context) {
  try {
    const { id } = await context.params;
    const result = await query("DELETE FROM planner_items WHERE id = $1 RETURNING id", [id]);
    if (!result.rowCount) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("DELETE /api/items/:id", error);
    return NextResponse.json({ error: "The item could not be removed." }, { status: 500 });
  }
}

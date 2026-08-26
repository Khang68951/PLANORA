import { NextResponse } from "next/server";
import { itemColumns, validateItem } from "@/lib/items";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await query(`SELECT ${itemColumns} FROM planner_items ORDER BY due_at ASC`);
    return NextResponse.json({ items: result.rows });
  } catch (error) {
    console.error("GET /api/items", error);
    return NextResponse.json(
      { error: "Planora cannot reach its database yet. Follow the setup steps in README.md." },
      { status: 503 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const errors = validateItem(body);
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the form.", errors }, { status: 400 });

    const result = await query(
      `INSERT INTO planner_items (title, description, kind, due_at, category, priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${itemColumns}`,
      [
        body.title.trim(),
        body.description?.trim() || "",
        body.kind,
        new Date(body.due_at).toISOString(),
        body.category?.trim() || "Personal",
        body.priority || "medium",
      ],
    );
    return NextResponse.json({ item: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error("POST /api/items", error);
    return NextResponse.json({ error: "The item could not be saved. Please try again." }, { status: 500 });
  }
}

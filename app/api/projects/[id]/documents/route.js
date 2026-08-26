import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";
import { sanitizeDocumentHtml, validateDocument } from "@/lib/projects";

export async function POST(request, context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
    const body = await request.json();
    const errors = validateDocument(body);
    if (!body.title) errors.title = "Enter a document title.";
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the document.", errors }, { status: 400 });
    const result = await query(`INSERT INTO project_documents (project_id, title, content_html)
      SELECT id, $2, $3 FROM projects WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, title, content_html AS "contentHtml", created_at AS "createdAt", updated_at AS "updatedAt"`, [id, body.title.trim(), sanitizeDocumentHtml(body.contentHtml)]);
    if (!result.rowCount) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ document: result.rows[0] }, { status: 201 });
  } catch (error) { console.error("POST project document", error); return NextResponse.json({ error: "Document could not be created." }, { status: 500 }); }
}

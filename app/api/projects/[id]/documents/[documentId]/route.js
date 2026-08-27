import { NextResponse } from "next/server";
import { isUuid } from "@/lib/categories";
import { query } from "@/lib/db";
import { sanitizeDocumentHtml, validateDocument } from "@/lib/projects";

export async function PATCH(request, context) {
  try {
    const { id, documentId } = await context.params;
    if (!isUuid(id) || !isUuid(documentId)) return NextResponse.json({ error: "Invalid document." }, { status: 400 });
    const body = await request.json();
    const current = (await query(`SELECT title, content_html AS "contentHtml", updated_at AS "updatedAt" FROM project_documents WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`, [documentId, id])).rows[0];
    if (!current) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    if (body.expectedUpdatedAt) {
      const expected = new Date(body.expectedUpdatedAt);
      if (Number.isNaN(expected.getTime())) return NextResponse.json({ error: "The document version is invalid." }, { status: 400 });
      if (expected.toISOString() !== new Date(current.updatedAt).toISOString()) return NextResponse.json({ error: "This document changed after the AI prepared its proposal. Ask the AI to review the latest version before applying it." }, { status: 409 });
    }
    const candidate = { ...current, ...body };
    const errors = validateDocument(candidate, { contentRequired: true });
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the document.", errors }, { status: 400 });
    const result = await query(`UPDATE project_documents SET title = $1, content_html = $2, updated_at = NOW() WHERE id = $3 AND project_id = $4 AND deleted_at IS NULL
      RETURNING id, title, content_html AS "contentHtml", created_at AS "createdAt", updated_at AS "updatedAt"`, [candidate.title.trim(), sanitizeDocumentHtml(candidate.contentHtml), documentId, id]);
    return NextResponse.json({ document: result.rows[0] });
  } catch (error) { console.error("PATCH project document", error); return NextResponse.json({ error: "Document could not be saved." }, { status: 500 }); }
}

export async function DELETE(_request, context) {
  try {
    const { id, documentId } = await context.params;
    if (!isUuid(id) || !isUuid(documentId)) return NextResponse.json({ error: "Invalid document." }, { status: 400 });
    const result = await query("DELETE FROM project_documents WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL RETURNING id", [documentId, id]);
    if (!result.rowCount) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) { console.error("DELETE project document", error); return NextResponse.json({ error: "Document could not be deleted." }, { status: 500 }); }
}

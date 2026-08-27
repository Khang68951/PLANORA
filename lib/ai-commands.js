import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import sanitizeHtml from "sanitize-html";
import { isUuid } from "./categories.js";
import { getPool } from "./db.js";
import { validateItem } from "./items.js";
import { isAIReadableFile, storagePath } from "./project-files.js";
import { insertDocumentHtml, removeDocumentHtml } from "./document-insertion.js";
import { replaceItemAssignees, sanitizeDocumentHtml, validateAssigneeIds, validateDocument, validateMember, validateProject } from "./projects.js";

export const AI_COMMAND_MODES = ["approve_all", "approve_changes", "auto"];

export const AI_COMMAND_DEFINITIONS = {
  "project.get": { safety: "read", description: "Read project information and progress." },
  "project.search": { safety: "read", description: "Search active documents, files, work, and members in this project." },
  "documents.list": { safety: "read", description: "List active project documents." },
  "documents.read": { safety: "read", description: "Read one project document by documentId." },
  "files.list": { safety: "read", description: "List project files and whether their text is readable." },
  "files.read_text": { safety: "read", description: "Read one supported text file by fileId." },
  "work.list": { safety: "read", description: "List active project tasks and deadlines." },
  "work.get": { safety: "read", description: "Read one active task or deadline by workId." },
  "members.list": { safety: "read", description: "List active project members and roles." },
  "documents.create": { safety: "change", description: "Create a rich-text document with title and contentHtml." },
  "documents.update": { safety: "change", description: "Replace an existing document's complete contentHtml, optionally renaming it." },
  "documents.insert": { safety: "change", description: "Insert a rich-text fragment at the start, end, before, or after an exact text anchor in a document." },
  "documents.remove": { safety: "change", description: "Remove an exact text or HTML fragment from a numbered occurrence in a document." },
  "documents.rename": { safety: "change", description: "Rename a document by documentId." },
  "documents.trash": { safety: "destructive", description: "Move a document out of the active workspace with Undo available." },
  "files.trash": { safety: "destructive", description: "Move a file out of the active workspace without deleting its local bytes." },
  "work.create": { safety: "change", description: "Create a task or deadline in this project with optional PIC member IDs in assigneeIds." },
  "work.update": { safety: "change", description: "Edit an existing project task or deadline." },
  "work.assign": { safety: "change", description: "Replace an existing work item's optional PIC with zero, one, or many project member IDs." },
  "work.trash": { safety: "destructive", description: "Move a project task or deadline to recoverable Trash." },
  "members.create": { safety: "change", description: "Add a project member with an optional role." },
  "members.update": { safety: "change", description: "Change a project member's name or role." },
  "members.remove": { safety: "destructive", description: "Remove a member from active use while keeping an Undo record." },
  "project.update": { safety: "change", description: "Update project information, dates, status, progress, or category." },
};

export const aiCommandCatalog = () => Object.entries(AI_COMMAND_DEFINITIONS).map(([name, definition]) => ({ name, ...definition }));
export const commandRequiresApproval = (mode, safety, name = "") => ["documents.update", "documents.insert", "documents.remove"].includes(name) || mode === "approve_all" || (mode === "approve_changes" && safety !== "read");
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const text = (value, maximum) => typeof value === "string" && value.trim() && value.length <= maximum;

const COMMAND_NAME_ALIASES = {
  "documents.add": "documents.insert",
  "documents.add_text": "documents.insert",
  "documents.append": "documents.insert",
  "documents.delete_text": "documents.remove",
  "documents.remove_text": "documents.remove",
};

function firstDefined(source, names) {
  for (const name of names) if (has(source, name)) return source[name];
  return undefined;
}

export function normalizeAICommandShape(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const name = COMMAND_NAME_ALIASES[raw.name] || raw.name;
  let suppliedArguments = raw.arguments ?? raw.args ?? raw.input;
  if (typeof suppliedArguments === "string") {
    try { suppliedArguments = JSON.parse(suppliedArguments); } catch { suppliedArguments = {}; }
  }
  const original = suppliedArguments && typeof suppliedArguments === "object" && !Array.isArray(suppliedArguments) ? suppliedArguments : {};
  const args = { ...original };
  const aliases = {
    documentId: ["documentId", "document_id", "docId", "doc_id"],
    contentHtml: ["contentHtml", "content_html", "html", "content"],
    anchorText: ["anchorText", "anchor_text", "anchor"],
    targetText: ["targetText", "target_text", "textToRemove", "text_to_remove", "text"],
    position: ["position", "location"],
    occurrence: ["occurrence", "occurrenceNumber", "occurrence_number"],
    assigneeIds: ["assigneeIds", "assignee_ids", "picIds", "pic_ids", "memberIds", "member_ids"],
  };
  if (name.startsWith("documents.")) {
    for (const [field, names] of Object.entries(aliases)) {
      const value = firstDefined(original, names);
      if (value !== undefined) args[field] = value;
    }
    const positions = { beginning: "start", top: "start", append: "end", bottom: "end" };
    if (typeof args.position === "string") args.position = positions[args.position.toLowerCase()] || args.position.toLowerCase();
    if (typeof args.occurrence === "string" && /^\d+$/.test(args.occurrence)) args.occurrence = Number(args.occurrence);
  }
  if (["work.create", "work.update", "work.assign"].includes(name)) {
    const assigneeIds = firstDefined(original, aliases.assigneeIds);
    if (assigneeIds !== undefined) args.assigneeIds = assigneeIds;
  }
  return { ...raw, name, arguments: args };
}

export function validateAICommand(raw) {
  if (!raw || typeof raw !== "object" || !AI_COMMAND_DEFINITIONS[raw.name]) return { error: "Unknown AI command." };
  const args = raw.arguments && typeof raw.arguments === "object" && !Array.isArray(raw.arguments) ? raw.arguments : {};
  const identifierFields = {
    "documents.read": "documentId", "documents.update": "documentId", "documents.insert": "documentId", "documents.remove": "documentId", "documents.rename": "documentId", "documents.trash": "documentId",
    "files.read_text": "fileId", "files.trash": "fileId", "work.get": "workId", "work.update": "workId", "work.assign": "workId",
    "work.trash": "workId", "members.update": "memberId", "members.remove": "memberId",
  };
  const identifier = identifierFields[raw.name];
  if (identifier && !isUuid(args[identifier])) return { error: `${identifier} must identify an item in this project.` };
  if (raw.name === "project.search" && !text(args.query, 200)) return { error: "Search text is required." };
  if (raw.name === "documents.create" && (!text(args.title, 120) || typeof args.contentHtml !== "string" || args.contentHtml.length > 500_000)) return { error: "Document title and content are invalid." };
  if (raw.name === "documents.update" && (typeof args.contentHtml !== "string" || args.contentHtml.length > 500_000 || (has(args, "title") && !text(args.title, 120)))) return { error: "Document replacement is invalid." };
  if (raw.name === "documents.insert" && (typeof args.contentHtml !== "string" || !args.contentHtml || args.contentHtml.length > 100_000 || !["start", "end", "before", "after"].includes(args.position) || (["before", "after"].includes(args.position) && !text(args.anchorText, 500)))) return { error: "Document insertion is invalid." };
  if (raw.name === "documents.remove" && (!text(args.targetText, 100_000) || (has(args, "occurrence") && (!Number.isInteger(args.occurrence) || args.occurrence < 1 || args.occurrence > 50)))) return { error: "Document removal is invalid." };
  if (raw.name === "documents.rename" && !text(args.title, 120)) return { error: "Document title is invalid." };
  if (raw.name === "work.create" && (Object.keys(validateItem(args)).length || (has(args, "assigneeIds") && !validateAssigneeIds(args.assigneeIds)))) return { error: "Task, deadline, or PIC fields are invalid." };
  if (raw.name === "work.update" && has(args, "assigneeIds")) return { error: "Use work.assign to change an existing work item's PIC." };
  if (raw.name === "work.update" && !Object.keys(args).some((key) => key !== "workId")) return { error: "No work changes were supplied." };
  if (raw.name === "work.assign" && !validateAssigneeIds(args.assigneeIds)) return { error: "Assignee IDs are invalid." };
  if (raw.name === "members.create" && Object.keys(validateMember(args)).length) return { error: "Member fields are invalid." };
  if (raw.name === "members.update" && !Object.keys(args).some((key) => key !== "memberId")) return { error: "No member changes were supplied." };
  if (raw.name === "project.update" && (Object.keys(validateProject(args, { partial: true })).length || !Object.keys(args).length)) return { error: "Project changes are invalid." };
  const summary = text(raw.summary, 240) ? raw.summary.trim() : `${AI_COMMAND_DEFINITIONS[raw.name].description}`;
  return { value: { name: raw.name, arguments: args, summary, safety: AI_COMMAND_DEFINITIONS[raw.name].safety } };
}

export function normalizeAICommands(commands) {
  return normalizeAICommandBatch(commands).commands;
}

export function normalizeAICommandBatch(commands) {
  if (!Array.isArray(commands)) return { commands: [], rejections: [] };
  return commands.slice(0, 20).reduce((result, command) => {
    const normalized = normalizeAICommandShape(command);
    const validated = validateAICommand(normalized);
    if (validated.value) result.commands.push(validated.value);
    else result.rejections.push({ name: normalized?.name || "unknown", error: validated.error });
    return result;
  }, { commands: [], rejections: [] });
}

export function legacyProposalsToCommands(proposals = []) {
  const names = { createTask: "work.create", createDeadline: "work.create", createDocument: "documents.create", updateDocument: "documents.update" };
  return proposals.flatMap((proposal) => names[proposal?.type] ? [{ name: names[proposal.type], arguments: proposal.data, summary: proposal.data?.title ? `${names[proposal.type]}: ${proposal.data.title}` : names[proposal.type] }] : []);
}

export function toAICommandModel(row) {
  return {
    id: row.id, name: row.name, safety: row.safety, mode: row.mode, arguments: row.arguments,
    summary: row.summary, status: row.status, result: row.result, error: row.error,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    decidedAt: row.decidedAt instanceof Date ? row.decidedAt.toISOString() : row.decidedAt,
  };
}

const activeProject = async (client, projectId) => {
  const result = await client.query("SELECT id, title, description, category_id, project_type, start_date, deadline, status, progress FROM projects WHERE id = $1 AND deleted_at IS NULL", [projectId]);
  if (!result.rowCount) throw new Error("Project not found.");
  return result.rows[0];
};

export async function executeAICommand({ projectId, name, arguments: args }) {
  const validated = validateAICommand({ name, arguments: args });
  if (!validated.value) throw new Error(validated.error);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const project = await activeProject(client, projectId);
    let result;
    if (name === "project.get") result = { project };
    else if (name === "project.search") {
      const pattern = `%${args.query.trim()}%`;
      const [documents, files, work, members] = await Promise.all([
        client.query("SELECT id, title FROM project_documents WHERE project_id = $1 AND deleted_at IS NULL AND (title ILIKE $2 OR content_html ILIKE $2) LIMIT 20", [projectId, pattern]),
        client.query("SELECT id, original_name AS name FROM project_files WHERE project_id = $1 AND deleted_at IS NULL AND original_name ILIKE $2 LIMIT 20", [projectId, pattern]),
        client.query("SELECT id, kind, title, status FROM planner_items WHERE project_id = $1 AND deleted_at IS NULL AND (title ILIKE $2 OR description ILIKE $2) LIMIT 20", [projectId, pattern]),
        client.query("SELECT id, name, role FROM project_members WHERE project_id = $1 AND deleted_at IS NULL AND (name ILIKE $2 OR role ILIKE $2) LIMIT 20", [projectId, pattern]),
      ]);
      result = { query: args.query.trim(), documents: documents.rows, files: files.rows, work: work.rows, members: members.rows };
    } else if (name === "documents.list") result = { documents: (await client.query("SELECT id, title, updated_at AS \"updatedAt\" FROM project_documents WHERE project_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC", [projectId])).rows };
    else if (name === "documents.read") {
      const document = (await client.query("SELECT id, title, content_html AS \"contentHtml\", updated_at AS \"updatedAt\" FROM project_documents WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL", [args.documentId, projectId])).rows[0];
      if (!document) throw new Error("Document not found in this project.");
      result = { document: { ...document, contentText: sanitizeHtml(document.contentHtml, { allowedTags: [] }).slice(0, 40_000) } };
    } else if (name === "files.list") result = { files: (await client.query("SELECT id, original_name AS name, mime_type AS \"mimeType\", size_bytes::int AS \"sizeBytes\" FROM project_files WHERE project_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC", [projectId])).rows };
    else if (name === "files.read_text") {
      const file = (await client.query("SELECT id, original_name AS name, stored_name, mime_type AS \"mimeType\", size_bytes::int AS \"sizeBytes\" FROM project_files WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL", [args.fileId, projectId])).rows[0];
      if (!file) throw new Error("File not found in this project.");
      if (!isAIReadableFile(file)) throw new Error("This file type cannot be read as text.");
      const content = (await readFile(storagePath(projectId, file.stored_name).target, "utf8")).slice(0, 40_000);
      result = { file: { id: file.id, name: file.name, content } };
    } else if (name === "work.list") result = { work: (await client.query("SELECT id, kind, title, description, start_at AS \"startAt\", end_at AS \"endAt\", due_at AS \"dueAt\", status, priority, updated_at AS \"updatedAt\" FROM planner_items WHERE project_id = $1 AND deleted_at IS NULL ORDER BY COALESCE(start_at, due_at)", [projectId])).rows };
    else if (name === "work.get") {
      const work = (await client.query("SELECT id, kind, title, description, start_at AS \"startAt\", end_at AS \"endAt\", due_at AS \"dueAt\", status, priority, updated_at AS \"updatedAt\" FROM planner_items WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL", [args.workId, projectId])).rows[0];
      if (!work) throw new Error("Work item not found in this project."); result = { work };
    } else if (name === "members.list") result = { members: (await client.query("SELECT id, name, role, updated_at AS \"updatedAt\" FROM project_members WHERE project_id = $1 AND deleted_at IS NULL ORDER BY lower(name)", [projectId])).rows };
    else if (name === "documents.create") {
      const errors = validateDocument(args); if (Object.keys(errors).length) throw new Error("Document fields are invalid.");
      result = { document: (await client.query("INSERT INTO project_documents (project_id, title, content_html) VALUES ($1, $2, $3) RETURNING id, title, content_html AS \"contentHtml\", updated_at AS \"updatedAt\"", [projectId, args.title.trim(), sanitizeDocumentHtml(args.contentHtml)])).rows[0] };
    } else if (["documents.update", "documents.insert", "documents.remove", "documents.rename"].includes(name)) {
      const current = (await client.query("SELECT title, content_html AS \"contentHtml\", updated_at AS \"updatedAt\" FROM project_documents WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL", [args.documentId, projectId])).rows[0];
      if (!current) throw new Error("Document not found in this project.");
      if (args.expectedUpdatedAt && new Date(args.expectedUpdatedAt).toISOString() !== new Date(current.updatedAt).toISOString()) throw new Error("The document changed after this command was prepared.");
      const candidate = {
        ...current,
        ...args,
        ...(name === "documents.insert" ? { contentHtml: args.previewContentHtml || insertDocumentHtml(current.contentHtml, args) } : {}),
        ...(name === "documents.remove" ? { contentHtml: args.previewContentHtml || removeDocumentHtml(current.contentHtml, args) } : {}),
      };
      const errors = validateDocument(candidate, { contentRequired: true }); if (Object.keys(errors).length) throw new Error("Document fields are invalid.");
      result = { document: (await client.query("UPDATE project_documents SET title = $1, content_html = $2, updated_at = NOW() WHERE id = $3 AND project_id = $4 RETURNING id, title, content_html AS \"contentHtml\", updated_at AS \"updatedAt\"", [candidate.title.trim(), sanitizeDocumentHtml(candidate.contentHtml), args.documentId, projectId])).rows[0] };
    } else if (name === "documents.trash") {
      const document = (await client.query("UPDATE project_documents SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL RETURNING id, title", [args.documentId, projectId])).rows[0];
      if (!document) throw new Error("Document not found in this project."); result = { trashed: document, undo: { entity: "document", id: document.id } };
    } else if (name === "files.trash") {
      const file = (await client.query("UPDATE project_files SET deleted_at = NOW() WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL RETURNING id, original_name AS name", [args.fileId, projectId])).rows[0];
      if (!file) throw new Error("File not found in this project."); result = { trashed: file, undo: { entity: "file", id: file.id } };
    } else if (name === "work.create") {
      const errors = validateItem(args); if (Object.keys(errors).length) throw new Error("Task or deadline fields are invalid.");
      const inserted = await client.query(`INSERT INTO planner_items (title, description, kind, start_at, end_at, due_at, category_id, project_id, priority, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, kind, title`, [args.title.trim(), args.description?.trim() || null, args.kind, args.kind === "task" ? args.startAt : null, args.kind === "task" ? args.endAt : null, args.kind === "deadline" ? args.dueAt : null, project.category_id, projectId, args.priority || "medium", args.status || "pending"]);
      if (!(await replaceItemAssignees(client, inserted.rows[0].id, projectId, args.assigneeIds || []))) throw new Error("Assignees must belong to this project."); result = { work: inserted.rows[0] };
    } else if (name === "work.update") {
      const current = (await client.query("SELECT title, description, kind, start_at AS \"startAt\", end_at AS \"endAt\", due_at AS \"dueAt\", priority, status, updated_at AS \"updatedAt\" FROM planner_items WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL", [args.workId, projectId])).rows[0];
      if (!current) throw new Error("Work item not found in this project."); const candidate = { ...current, ...args };
      if (args.expectedUpdatedAt && new Date(args.expectedUpdatedAt).toISOString() !== new Date(current.updatedAt).toISOString()) throw new Error("This work item changed after the command was prepared.");
      const errors = validateItem(candidate); if (Object.keys(errors).length) throw new Error("Task or deadline fields are invalid.");
      result = { work: (await client.query(`UPDATE planner_items SET title=$1, description=$2, kind=$3, start_at=$4, end_at=$5, due_at=$6, priority=$7, status=$8, updated_at=NOW()
        WHERE id=$9 AND project_id=$10 RETURNING id, kind, title, status`, [candidate.title.trim(), candidate.description?.trim() || null, candidate.kind, candidate.kind === "task" ? candidate.startAt : null, candidate.kind === "task" ? candidate.endAt : null, candidate.kind === "deadline" ? candidate.dueAt : null, candidate.priority, candidate.status, args.workId, projectId])).rows[0] };
    } else if (name === "work.assign") {
      const exists = await client.query("SELECT 1 FROM planner_items WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL", [args.workId, projectId]); if (!exists.rowCount) throw new Error("Work item not found in this project.");
      if (!(await replaceItemAssignees(client, args.workId, projectId, args.assigneeIds))) throw new Error("Assignees must belong to this project."); result = { workId: args.workId, assigneeIds: args.assigneeIds };
    } else if (name === "work.trash") {
      const batch = randomUUID(); const work = (await client.query("UPDATE planner_items SET deleted_at=NOW(), trash_batch_id=$1, updated_at=NOW() WHERE id=$2 AND project_id=$3 AND deleted_at IS NULL RETURNING id, kind, title", [batch, args.workId, projectId])).rows[0];
      if (!work) throw new Error("Work item not found in this project."); result = { trashed: work, undo: { entity: "work", id: work.id, batch } };
    } else if (name === "members.create") {
      const errors = validateMember(args); if (Object.keys(errors).length) throw new Error("Member fields are invalid.");
      result = { member: (await client.query("INSERT INTO project_members (project_id,name,role) VALUES ($1,$2,$3) RETURNING id,name,role", [projectId, args.name.trim(), args.role?.trim() || null])).rows[0] };
    } else if (name === "members.update") {
      const current = (await client.query("SELECT name,role FROM project_members WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL", [args.memberId, projectId])).rows[0]; if (!current) throw new Error("Member not found in this project.");
      const candidate = { ...current, ...args }; const errors = validateMember(candidate); if (Object.keys(errors).length) throw new Error("Member fields are invalid.");
      result = { member: (await client.query("UPDATE project_members SET name=$1,role=$2,updated_at=NOW() WHERE id=$3 AND project_id=$4 RETURNING id,name,role", [candidate.name.trim(), candidate.role?.trim() || null, args.memberId, projectId])).rows[0] };
    } else if (name === "members.remove") {
      const assignmentCount = Number((await client.query("SELECT COUNT(*) AS count FROM planner_item_assignees WHERE member_id=$1", [args.memberId])).rows[0].count);
      const member = (await client.query("UPDATE project_members SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL RETURNING id,name,role", [args.memberId, projectId])).rows[0]; if (!member) throw new Error("Member not found in this project.");
      result = { removed: member, assignmentCount, undo: { entity: "member", id: member.id } };
    } else if (name === "project.update") {
      const current = { name: project.title, description: project.description, categoryId: project.category_id, type: project.project_type, startDate: project.start_date?.toISOString?.().slice(0, 10) || project.start_date, deadline: project.deadline?.toISOString?.().slice(0, 10) || project.deadline, status: project.status, progress: Number(project.progress) };
      const candidate = { ...current, ...args }; const errors = validateProject(candidate); if (Object.keys(errors).length) throw new Error("Project fields are invalid.");
      const updated = await client.query(`UPDATE projects SET title=$1,description=$2,category_id=$3,project_type=$4,start_date=$5,deadline=$6,status=$7,progress=$8,updated_at=NOW()
        WHERE id=$9 AND EXISTS (SELECT 1 FROM categories WHERE id=$3 AND deleted_at IS NULL) RETURNING id,title AS name,status,progress`, [candidate.name.trim(), candidate.description?.trim() || null, candidate.categoryId, candidate.type, candidate.startDate || null, candidate.deadline || null, candidate.status, candidate.progress, projectId]);
      if (!updated.rowCount) throw new Error("Choose an active project category."); result = { project: updated.rows[0] };
    }
    if (!result) throw new Error("Command is not implemented.");
    await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function undoAICommand({ projectId, command }) {
  const undo = command.result?.undo;
  if (!undo) throw new Error("This command cannot be undone.");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN"); await activeProject(client, projectId);
    const tables = { document: "project_documents", file: "project_files", member: "project_members", work: "planner_items" };
    const table = tables[undo.entity]; if (!table) throw new Error("Undo target is invalid.");
    const result = await client.query(`UPDATE ${table} SET deleted_at=NULL${undo.entity === "work" ? ", trash_batch_id=NULL" : ""} WHERE id=$1 AND ${undo.entity === "work" ? "project_id" : "project_id"}=$2 AND deleted_at IS NOT NULL RETURNING id`, [undo.id, projectId]);
    if (!result.rowCount) throw new Error("The item could not be restored."); await client.query("COMMIT"); return { restored: undo };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

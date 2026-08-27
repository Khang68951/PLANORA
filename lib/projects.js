import sanitizeHtml from "sanitize-html";
import { isUuid } from "./categories.js";

export const projectTypes = ["academic", "work", "personal", "research", "other"];
export const projectStatuses = ["planned", "active", "on_hold", "completed"];
const has = (body, key) => Object.prototype.hasOwnProperty.call(body, key);
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

export function projectCreateCandidate(body, compatibilityCategoryId) {
  return {
    ...body,
    categoryId: compatibilityCategoryId,
    type: body.type || "other",
    status: body.status || "active",
    progress: body.progress ?? 0,
  };
}

export function validateProject(body, { partial = false } = {}) {
  const errors = {};
  if (!partial || has(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim()) errors.name = "Enter a project name.";
    else if (body.name.trim().length > 120) errors.name = "Use 120 characters or fewer.";
  }
  if (!partial || has(body, "categoryId")) {
    if (!isUuid(body.categoryId)) errors.categoryId = "Choose a valid category.";
  }
  if (has(body, "description") && body.description !== null && (typeof body.description !== "string" || body.description.length > 4000)) errors.description = "Use 4,000 characters or fewer.";
  if (has(body, "type") && !projectTypes.includes(body.type)) errors.type = "Choose a valid project type.";
  if (has(body, "status") && !projectStatuses.includes(body.status)) errors.status = "Choose a valid project status.";
  if (has(body, "progress") && (!Number.isInteger(body.progress) || body.progress < 0 || body.progress > 100)) errors.progress = "Progress must be from 0 to 100.";
  for (const key of ["startDate", "deadline"]) if (has(body, key) && body[key] !== null && (typeof body[key] !== "string" || !dateOnly.test(body[key]) || Number.isNaN(new Date(`${body[key]}T00:00:00Z`).getTime()))) errors[key] = "Choose a valid date.";
  if (!errors.startDate && !errors.deadline && body.startDate && body.deadline && body.deadline < body.startDate) errors.deadline = "Deadline must be on or after the start date.";
  return errors;
}

export function validateMember(body) {
  const errors = {};
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) errors.name = "Enter a member name using 100 characters or fewer.";
  if (body.role !== undefined && body.role !== null && (typeof body.role !== "string" || body.role.length > 80)) errors.role = "Use 80 characters or fewer.";
  return errors;
}

export function validateDocument(body, { contentRequired = false } = {}) {
  const errors = {};
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120)) errors.title = "Enter a document title using 120 characters or fewer.";
  if (contentRequired && typeof body.contentHtml !== "string") errors.contentHtml = "Document content is required.";
  if (typeof body.contentHtml === "string" && body.contentHtml.length > 500_000) errors.contentHtml = "Document content is too large.";
  return errors;
}

export function sanitizeDocumentHtml(value) {
  return sanitizeHtml(value || "", {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "code", "pre"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noreferrer noopener", target: "_blank" }) },
  });
}

export function validateAssigneeIds(value) {
  return Array.isArray(value) && value.length <= 50 && new Set(value).size === value.length && value.every(isUuid);
}

export async function replaceItemAssignees(client, itemId, projectId, assigneeIds = []) {
  if (!validateAssigneeIds(assigneeIds)) return false;
  if (assigneeIds.length && !projectId) return false;
  if (assigneeIds.length) {
    const valid = await client.query("SELECT COUNT(*)::int AS count FROM project_members WHERE project_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])", [projectId, assigneeIds]);
    if (valid.rows[0].count !== assigneeIds.length) return false;
  }
  await client.query("DELETE FROM planner_item_assignees WHERE item_id = $1", [itemId]);
  if (assigneeIds.length) await client.query("INSERT INTO planner_item_assignees (item_id, member_id) SELECT $1, unnest($2::uuid[])", [itemId, assigneeIds]);
  return true;
}

export function toProjectModel(row) {
  return {
    id: row.id, name: row.title, description: row.description, categoryId: row.categoryId,
    categoryName: row.categoryName, categoryColor: row.categoryColor, type: row.type,
    startDate: row.startDate, deadline: row.deadline, status: row.status, progress: Number(row.progress),
    aiCommandMode: row.aiCommandMode || "approve_changes",
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

export const projectSelect = `project.id, project.title, project.description,
  project.category_id AS "categoryId", category.name AS "categoryName", category.color AS "categoryColor",
  project.project_type AS "type", project.start_date AS "startDate", project.deadline,
  project.status, project.progress, project.ai_command_mode AS "aiCommandMode",
  project.created_at AS "createdAt", project.updated_at AS "updatedAt"`;

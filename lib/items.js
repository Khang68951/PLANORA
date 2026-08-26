import { isUuid } from "./categories.js";

export const kinds = ["task", "deadline"];
export const priorities = ["low", "medium", "high"];
export const statuses = ["pending", "completed"];

const has = (body, field) => Object.prototype.hasOwnProperty.call(body, field);
const validDate = (value) => (typeof value === "string" || value instanceof Date) && !Number.isNaN(new Date(value).getTime());

export function validateItem(body, { partial = false } = {}) {
  const errors = {};

  if (!partial || has(body, "title")) {
    if (typeof body.title !== "string" || !body.title.trim()) errors.title = "Please enter a title.";
    else if (body.title.trim().length > 120) errors.title = "Use 120 characters or fewer.";
  }
  if (!partial || has(body, "kind")) {
    if (!kinds.includes(body.kind)) errors.kind = "Choose task or deadline.";
  }
  if (has(body, "priority") && !priorities.includes(body.priority)) errors.priority = "Choose a valid priority.";
  if (has(body, "status") && !statuses.includes(body.status)) errors.status = "Choose a valid status.";
  if (has(body, "categoryId") && body.categoryId !== null && !isUuid(body.categoryId)) errors.categoryId = "Choose a valid category.";
  if (has(body, "projectId") && body.projectId !== null && !isUuid(body.projectId)) errors.projectId = "Choose a valid project.";
  if (has(body, "description") && body.description !== null && (typeof body.description !== "string" || body.description.length > 1000)) {
    errors.description = "Use 1,000 characters or fewer.";
  }

  if (body.kind === "task") {
    if (!partial || has(body, "startAt")) {
      if (!validDate(body.startAt)) errors.startAt = "Choose a valid task start date and time.";
    }
    if (!partial || has(body, "endAt")) {
      if (!validDate(body.endAt)) errors.endAt = "Choose a valid task end date and time.";
    }
    if (!errors.startAt && !errors.endAt && new Date(body.endAt) <= new Date(body.startAt)) errors.endAt = "Task end must be after its start.";
    if (body.dueAt !== undefined && body.dueAt !== null) errors.dueAt = "Tasks use startAt and endAt instead of dueAt.";
  }

  if (body.kind === "deadline") {
    if (!partial || has(body, "dueAt")) {
      if (!validDate(body.dueAt)) errors.dueAt = "Choose a valid deadline date and time.";
    }
    if (body.startAt !== undefined && body.startAt !== null) errors.startAt = "Deadlines use dueAt instead of startAt.";
    if (body.endAt !== undefined && body.endAt !== null) errors.endAt = "Deadlines use dueAt instead of endAt.";
  }

  return errors;
}

export const itemSelect = `
  item.id, item.title, item.description, item.kind,
  item.start_at AS "startAt", item.end_at AS "endAt", item.due_at AS "dueAt",
  item.priority, item.status,
  item.category_id AS "assignedCategoryId", item.project_id AS "projectId",
  category_record.id AS "categoryId", category_record.name AS "categoryName",
  category_record.color AS "categoryColor", project.title AS "projectTitle",
  COALESCE((SELECT json_agg(json_build_object('id', member.id, 'name', member.name, 'role', member.role) ORDER BY lower(member.name))
    FROM planner_item_assignees assignment JOIN project_members member ON member.id = assignment.member_id
    WHERE assignment.item_id = item.id), '[]'::json) AS assignees,
  item.created_at AS "createdAt", item.updated_at AS "updatedAt"
`;

export const itemJoins = `FROM planner_items item
  LEFT JOIN projects project ON project.id = item.project_id AND project.deleted_at IS NULL
  JOIN categories category_record ON category_record.id = COALESCE(project.category_id, item.category_id) AND category_record.deleted_at IS NULL`;

const iso = (value) => value instanceof Date ? value.toISOString() : value;

export function toItemModel(row) {
  const common = {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    categoryId: row.categoryId,
    projectId: row.projectId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    categoryName: row.categoryName,
    categoryColor: row.categoryColor,
    projectTitle: row.projectTitle,
    assignees: row.assignees || [],
  };
  return row.kind === "task"
    ? { ...common, startAt: iso(row.startAt), endAt: iso(row.endAt) }
    : { ...common, dueAt: iso(row.dueAt) };
}

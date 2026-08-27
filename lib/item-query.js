import { isUuid } from "./categories.js";

const allowedKinds = new Set(["task", "deadline"]);
const allowedStatuses = new Set(["pending", "completed"]);
const allowedPriorities = new Set(["low", "medium", "high"]);
const sortSql = {
  "date-asc": "COALESCE(item.start_at, item.due_at) ASC, item.id ASC",
  "date-desc": "COALESCE(item.start_at, item.due_at) DESC, item.id DESC",
  "title-asc": "LOWER(item.title) ASC, item.id ASC",
  "title-desc": "LOWER(item.title) DESC, item.id DESC",
  "priority-desc": "CASE item.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC, COALESCE(item.start_at, item.due_at) ASC",
  "priority-asc": "CASE item.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END ASC, COALESCE(item.start_at, item.due_at) ASC",
  created: "item.created_at DESC, item.id DESC",
  updated: "item.updated_at DESC, item.id DESC",
};

const list = (params, key) => params.getAll(key).flatMap((value) => value.split(",")).filter(Boolean);
const validDate = (value) => value && !Number.isNaN(new Date(value).getTime());
const dateBoundary = (value, end = false) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z` : value).toISOString();

export function buildItemQuery(input) {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(input || "");
  const conditions = ["item.deleted_at IS NULL"];
  const values = [];
  const errors = {};
  const add = (condition, value) => {
    values.push(value);
    conditions.push(condition.replace("?", `$${values.length}`));
  };

  const query = (params.get("query") || params.get("q") || "").trim();
  if (query.length > 120) errors.query = "Search text must use 120 characters or fewer.";
  else if (query) add("CONCAT_WS(' ', item.title, item.description, CASE WHEN item.project_id IS NULL THEN category_record.name END, project.title) ILIKE ?", `%${query}%`);

  const kinds = list(params, "kinds");
  const statuses = list(params, "statuses");
  const priorities = list(params, "priorities");
  if (kinds.some((value) => !allowedKinds.has(value))) errors.kinds = "Choose valid item kinds.";
  else if (kinds.length) add("item.kind = ANY(?::text[])", kinds);
  if (statuses.some((value) => !allowedStatuses.has(value))) errors.statuses = "Choose valid statuses.";
  else if (statuses.length) add("item.status = ANY(?::text[])", statuses);
  if (priorities.some((value) => !allowedPriorities.has(value))) errors.priorities = "Choose valid priorities.";
  else if (priorities.length) add("item.priority = ANY(?::text[])", priorities);

  const categories = list(params, "categories");
  if (categories.some((value) => !isUuid(value))) errors.categories = "Choose valid categories.";
  else if (categories.length) add("(item.project_id IS NOT NULL OR item.category_id = ANY(?::uuid[]))", categories);

  const projects = list(params, "projects");
  const includeNoProject = projects.includes("none");
  const projectIds = projects.filter((value) => value !== "none");
  if (projectIds.some((value) => !isUuid(value))) errors.projects = "Choose valid projects.";
  else if (projects.length) {
    if (projectIds.length && includeNoProject) {
      values.push(projectIds);
      conditions.push(`(item.project_id = ANY($${values.length}::uuid[]) OR item.project_id IS NULL)`);
    } else if (includeNoProject) conditions.push("item.project_id IS NULL");
    else add("item.project_id = ANY(?::uuid[])", projectIds);
  }

  const assignees = list(params, "assignees");
  if (assignees.some((value) => !isUuid(value))) errors.assignees = "Choose valid project members.";
  else if (assignees.length) add("EXISTS (SELECT 1 FROM planner_item_assignees filter_assignment WHERE filter_assignment.item_id = item.id AND filter_assignment.member_id = ANY(?::uuid[]))", assignees);

  const from = params.get("from");
  const to = params.get("to");
  if (from && !validDate(from)) errors.from = "Choose a valid start date.";
  else if (from) add("COALESCE(item.end_at, item.due_at) >= ?::timestamptz", dateBoundary(from));
  if (to && !validDate(to)) errors.to = "Choose a valid end date.";
  else if (to) add("COALESCE(item.end_at, item.due_at) <= ?::timestamptz", dateBoundary(to, true));
  if (params.get("overdue") === "true") conditions.push("item.status <> 'completed' AND COALESCE(item.end_at, item.due_at) < NOW()");

  const sort = params.get("sort") || "date-asc";
  if (!sortSql[sort]) errors.sort = "Choose a valid sort order.";
  const page = Number(params.get("page") || 1);
  const limit = Number(params.get("limit") || 100);
  if (!Number.isInteger(page) || page < 1) errors.page = "Page must be a positive integer.";
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) errors.limit = "Limit must be between 1 and 200.";

  return {
    errors,
    where: conditions.join(" AND "),
    values,
    orderBy: sortSql[sort] || sortSql["date-asc"],
    page: Number.isInteger(page) && page > 0 ? page : 1,
    limit: Number.isInteger(limit) && limit > 0 && limit <= 200 ? limit : 100,
  };
}

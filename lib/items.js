export const kinds = ["task", "deadline"];
export const priorities = ["low", "medium", "high"];
export const statuses = ["pending", "completed"];

export function validateItem(body, { partial = false } = {}) {
  const errors = {};
  const has = (field) => Object.prototype.hasOwnProperty.call(body, field);

  if (!partial || has("title")) {
    if (typeof body.title !== "string" || !body.title.trim()) errors.title = "Please enter a title.";
    else if (body.title.trim().length > 120) errors.title = "Use 120 characters or fewer.";
  }
  if (!partial || has("kind")) {
    if (!kinds.includes(body.kind)) errors.kind = "Choose task or deadline.";
  }
  if (!partial || has("due_at")) {
    if (!body.due_at || Number.isNaN(new Date(body.due_at).getTime())) errors.due_at = "Choose a valid date and time.";
  }
  if (has("priority") && !priorities.includes(body.priority)) errors.priority = "Choose a valid priority.";
  if (has("status") && !statuses.includes(body.status)) errors.status = "Choose a valid status.";
  if (has("category") && (typeof body.category !== "string" || body.category.trim().length > 40)) {
    errors.category = "Use 40 characters or fewer.";
  }
  if (has("description") && (typeof body.description !== "string" || body.description.length > 1000)) {
    errors.description = "Use 1,000 characters or fewer.";
  }

  return errors;
}

export const itemColumns = `
  id, title, description, kind, due_at, category, priority, status, created_at, updated_at
`;

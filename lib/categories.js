export const DEFAULT_CATEGORY_COLOR = "#5e6c70";
export const MIN_CATEGORY_DEPTH = 1;
export const MAX_CATEGORY_DEPTH = 8;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === "string" && uuidPattern.test(value);

export function validateCategory(body, { partial = false } = {}) {
  const errors = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  if (!partial || has("name")) {
    if (typeof body.name !== "string" || !body.name.trim()) errors.name = "Enter a category name.";
    else if (body.name.trim().length > 60) errors.name = "Use 60 characters or fewer.";
  }
  if (has("color") && (typeof body.color !== "string" || !/^#[0-9a-f]{6}$/i.test(body.color))) {
    errors.color = "Choose a six-digit hex color.";
  }
  if (has("parent_id") && body.parent_id !== null && !isUuid(body.parent_id)) errors.parent_id = "Choose a valid parent category.";
  if (has("is_hidden") && typeof body.is_hidden !== "boolean") errors.is_hidden = "Visibility must be true or false.";
  return errors;
}

export function validateSettings(body) {
  const errors = {};
  if (body.default_category_id !== undefined && !isUuid(body.default_category_id)) errors.default_category_id = "Choose a valid default category.";
  if (body.max_category_depth !== undefined && (!Number.isInteger(body.max_category_depth) || body.max_category_depth < MIN_CATEGORY_DEPTH || body.max_category_depth > MAX_CATEGORY_DEPTH)) {
    errors.max_category_depth = `Choose a depth from ${MIN_CATEGORY_DEPTH} to ${MAX_CATEGORY_DEPTH}.`;
  }
  return errors;
}

export function descendantsOf(categories, id) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parent_id && ids.has(category.parent_id) && !ids.has(category.id)) {
        ids.add(category.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function visibleCategoryTree(categories, collapsedIds = new Set()) {
  const ids = new Set(categories.map((category) => category.id));
  const result = [];
  const visit = (parentId, depth) => {
    categories
      .filter((category) => category.parent_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((category) => {
        const hasChildren = categories.some((candidate) => candidate.parent_id === category.id);
        result.push({ ...category, depth, hasChildren });
        if (!collapsedIds.has(category.id)) visit(category.id, depth + 1);
      });
  };
  categories
    .filter((category) => !category.parent_id || !ids.has(category.parent_id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((category) => {
      const hasChildren = categories.some((candidate) => candidate.parent_id === category.id);
      result.push({ ...category, depth: 0, hasChildren });
      if (!collapsedIds.has(category.id)) visit(category.id, 1);
    });
  return result;
}

const words = (value) => new Set((value || "").toLowerCase().match(/[a-z0-9]{3,}/g) || []);

export function suggestCategories({ title = "", description = "", categories = [], examples = [] }) {
  const inputWords = words(`${title} ${description}`);
  if (!inputWords.size) return [];
  return categories
    .filter((category) => !category.is_hidden && !category.deleted_at)
    .map((category) => {
      const categoryWords = words(category.name);
      let score = [...categoryWords].filter((word) => inputWords.has(word)).length * 8;
      for (const example of examples.filter((item) => item.category_id === category.id)) {
        const overlap = [...words(`${example.title} ${example.description}`)].filter((word) => inputWords.has(word)).length;
        score += Math.min(overlap, 4);
      }
      return { id: category.id, name: category.name, color: category.color, score };
    })
    .filter((category) => category.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map(({ score: _score, ...category }) => category);
}

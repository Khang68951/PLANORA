export const NO_PROJECT = "none";
export const TASK_FILTER_DEFAULTS = Object.freeze({
  query: "",
  quick: "all",
  kinds: [],
  statuses: [],
  time: "",
  from: "",
  to: "",
  priorities: [],
  categories: [],
  projects: [],
  assignees: [],
  sort: "date-asc",
});

const DAY_MS = 86_400_000;
const startOfDay = (value) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};
const endOfDay = (value) => new Date(startOfDay(value).getTime() + DAY_MS - 1);

export const itemStart = (item) => new Date(item.kind === "task" ? item.startAt : item.dueAt);
export const itemEnd = (item) => new Date(item.kind === "task" ? item.endAt : item.dueAt);
export const isOverdue = (item, now = new Date()) => item.status !== "completed" && itemEnd(item) < now;

export function relativeItemDate(item, now = new Date()) {
  const difference = Math.round((startOfDay(itemEnd(item)) - startOfDay(now)) / DAY_MS);
  if (item.status === "completed") return "Completed";
  if (difference < -1) return `${Math.abs(difference)} days overdue`;
  if (difference === -1) return "Yesterday";
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  if (difference < 7) return `In ${difference} days`;
  return itemEnd(item).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function timeRangeForPreset(preset, now = new Date(), custom = {}) {
  const today = startOfDay(now);
  if (preset === "overdue") return { before: new Date(now), overdueOnly: true };
  if (preset === "today") return { from: today, to: endOfDay(today) };
  if (preset === "tomorrow") {
    const tomorrow = new Date(today.getTime() + DAY_MS);
    return { from: tomorrow, to: endOfDay(tomorrow) };
  }
  if (preset === "next7") return { from: today, to: endOfDay(new Date(today.getTime() + 6 * DAY_MS)) };
  if (preset === "month") return {
    from: new Date(today.getFullYear(), today.getMonth(), 1),
    to: new Date(today.getFullYear(), today.getMonth() + 1, 1, 0, 0, 0, -1),
  };
  if (preset === "custom") return {
    from: custom.from ? startOfDay(`${custom.from}T00:00:00`) : null,
    to: custom.to ? endOfDay(`${custom.to}T00:00:00`) : null,
  };
  return null;
}

const includesAny = (selected, values) => !selected.length || values.some((value) => selected.includes(value));

export function filterPlannerItems(items, filters, now = new Date()) {
  const state = { ...TASK_FILTER_DEFAULTS, ...filters };
  const query = state.query.trim().toLocaleLowerCase();
  const timeRange = timeRangeForPreset(state.time, now, state);

  return items.filter((item) => {
    if (state.quick === "task" && item.kind !== "task") return false;
    if (state.quick === "deadline" && item.kind !== "deadline") return false;
    if (state.quick === "overdue" && !isOverdue(item, now)) return false;
    if (!includesAny(state.kinds, [item.kind])) return false;
    if (!includesAny(state.statuses, [item.status])) return false;
    if (!includesAny(state.priorities, [item.priority])) return false;
    if (!item.projectId && !includesAny(state.categories, [item.categoryId])) return false;
    if (!includesAny(state.projects, [item.projectId || NO_PROJECT])) return false;
    if (!includesAny(state.assignees, (item.assignees || []).map((member) => member.id))) return false;
    if (timeRange?.overdueOnly && !isOverdue(item, now)) return false;
    const scheduled = itemEnd(item);
    if (timeRange?.from && scheduled < timeRange.from) return false;
    if (timeRange?.to && scheduled > timeRange.to) return false;
    if (query) {
      const searchable = [
        item.title,
        item.description,
        item.projectId ? null : item.categoryName,
        item.projectTitle,
        ...(item.assignees || []).flatMap((member) => [member.name, member.role]),
      ].filter(Boolean).join(" ").toLocaleLowerCase();
      if (!searchable.includes(query)) return false;
    }
    return true;
  });
}

const priorityRank = { low: 1, medium: 2, high: 3 };

export function sortPlannerItems(items, sort = TASK_FILTER_DEFAULTS.sort) {
  const sorted = [...items];
  const titleCompare = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  const dateCompare = (a, b) => itemEnd(a) - itemEnd(b);
  const updatedCompare = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt);
  const createdCompare = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  const comparators = {
    "date-asc": dateCompare,
    "date-desc": (a, b) => -dateCompare(a, b),
    "title-asc": titleCompare,
    "title-desc": (a, b) => -titleCompare(a, b),
    "priority-desc": (a, b) => priorityRank[b.priority] - priorityRank[a.priority] || dateCompare(a, b),
    "priority-asc": (a, b) => priorityRank[a.priority] - priorityRank[b.priority] || dateCompare(a, b),
    created: createdCompare,
    updated: updatedCompare,
  };
  return sorted.sort(comparators[sort] || dateCompare);
}

const ARRAY_KEYS = ["kinds", "statuses", "priorities", "categories", "projects", "assignees"];

export function taskFiltersFromSearchParams(input) {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(input || "");
  const state = { ...TASK_FILTER_DEFAULTS };
  for (const key of ["query", "quick", "time", "from", "to", "sort"]) {
    if (params.get(key)) state[key] = params.get(key);
  }
  for (const key of ARRAY_KEYS) state[key] = params.getAll(key).filter(Boolean);
  return state;
}

export function taskFiltersToSearchParams(filters) {
  const state = { ...TASK_FILTER_DEFAULTS, ...filters };
  const params = new URLSearchParams();
  for (const key of ["query", "quick", "time", "from", "to", "sort"]) {
    if (state[key] && state[key] !== TASK_FILTER_DEFAULTS[key]) params.set(key, state[key]);
  }
  for (const key of ARRAY_KEYS) for (const value of state[key]) params.append(key, value);
  return params;
}

export function activeTaskFilterCount(filters) {
  const state = { ...TASK_FILTER_DEFAULTS, ...filters };
  return ARRAY_KEYS.reduce((total, key) => total + (state[key].length ? 1 : 0), 0)
    + (state.time ? 1 : 0)
    + (state.from || state.to ? 1 : 0);
}

export function selectPlannerItems(items, filters, now = new Date()) {
  return sortPlannerItems(filterPlannerItems(items, filters, now), filters.sort);
}

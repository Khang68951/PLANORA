export const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const NO_PROJECT_FILTER = "__no_project__";

export function filterItemsByCategories(items, selectedCategoryIds, availableCategoryIds = []) {
  const selected = new Set(selectedCategoryIds === null ? availableCategoryIds : selectedCategoryIds);
  return items.filter((item) => item.projectId || selected.has(item.categoryId));
}

export function filterItemsByProjects(items, selectedProjectIds) {
  if (selectedProjectIds === null) return items;
  const selected = new Set(selectedProjectIds);
  return items.filter((item) => item.projectId ? selected.has(item.projectId) : selected.has(NO_PROJECT_FILTER));
}

export function startOfWeek(date) {
  const day = startOfDay(date);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - day.getDay());
}

export function calendarDays(cursor, mode) {
  if (mode === "day") return [startOfDay(cursor)];
  if (mode === "week") {
    const first = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + index));
  }
  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const first = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + index));
}

export function shiftCalendarCursor(cursor, mode, amount) {
  if (mode === "month") return new Date(cursor.getFullYear(), cursor.getMonth() + amount, 1);
  const days = mode === "week" ? amount * 7 : amount;
  return new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + days);
}

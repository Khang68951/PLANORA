export const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

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

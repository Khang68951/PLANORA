import test from "node:test";
import assert from "node:assert/strict";
import { calendarDays, filterItemsByCategories, filterItemsByProjects, NO_PROJECT_FILTER, shiftCalendarCursor, startOfWeek } from "../lib/calendar.js";

test("calendar modes produce one day, one Sunday-first week, or a six-week month grid", () => {
  const cursor = new Date(2026, 7, 26, 15, 30);
  assert.equal(calendarDays(cursor, "day").length, 1);
  assert.equal(calendarDays(cursor, "week").length, 7);
  assert.equal(calendarDays(cursor, "month").length, 42);
  assert.equal(startOfWeek(cursor).getDay(), 0);
  assert.equal(calendarDays(cursor, "day")[0].getHours(), 0);
});

test("calendar navigation shifts by its active mode", () => {
  const cursor = new Date(2026, 11, 30);
  const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  assert.deepEqual(
    ["day", "week", "month"].map((mode) => localDate(shiftCalendarCursor(cursor, mode, 1))),
    ["2026-12-31", "2027-01-06", "2027-01-01"],
  );
});

test("calendar project filtering includes selected projects and unassigned work independently", () => {
  const items = [
    { id: "unassigned", projectId: null },
    { id: "alpha-work", projectId: "alpha" },
    { id: "beta-work", projectId: "beta" },
  ];
  assert.equal(filterItemsByProjects(items, null), items);
  assert.deepEqual(filterItemsByProjects(items, ["alpha"]).map((item) => item.id), ["alpha-work"]);
  assert.deepEqual(filterItemsByProjects(items, [NO_PROJECT_FILTER, "beta"]).map((item) => item.id), ["unassigned", "beta-work"]);
  assert.deepEqual(filterItemsByProjects(items, []), []);
});

test("calendar category filtering applies only to standalone work", () => {
  const items = [
    { id: "standalone-a", categoryId: "a", projectId: null },
    { id: "standalone-b", categoryId: "b", projectId: null },
    { id: "project-work", categoryId: "a", projectId: "project-a" },
  ];
  assert.deepEqual(filterItemsByCategories(items, ["b"]).map((item) => item.id), ["standalone-b", "project-work"]);
  assert.deepEqual(filterItemsByCategories(items, [], ["a", "b"]).map((item) => item.id), ["project-work"]);
});

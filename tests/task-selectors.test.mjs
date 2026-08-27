import test from "node:test";
import assert from "node:assert/strict";
import {
  activeTaskFilterCount,
  filterPlannerItems,
  selectPlannerItems,
  sortPlannerItems,
  taskFiltersFromSearchParams,
  taskFiltersToSearchParams,
  timeRangeForPreset,
} from "../lib/task-selectors.js";

const now = new Date("2026-08-27T12:00:00.000Z");
const items = [
  {
    id: "late",
    kind: "deadline",
    title: "Release",
    description: "Ship alpha",
    dueAt: "2026-08-26T10:00:00.000Z",
    priority: "high",
    status: "pending",
    categoryId: "cat-a",
    categoryName: "Work",
    projectId: "project-a",
    projectTitle: "Alpha",
    assignees: [{ id: "member-a", name: "Alex" }],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  },
  {
    id: "today",
    kind: "task",
    title: "Notes",
    startAt: "2026-08-27T13:00:00.000Z",
    endAt: "2026-08-27T14:00:00.000Z",
    priority: "low",
    status: "pending",
    categoryId: "cat-b",
    categoryName: "Study",
    projectId: null,
    assignees: [],
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  },
  {
    id: "tomorrow",
    kind: "deadline",
    title: "Review",
    dueAt: "2026-08-28T15:00:00.000Z",
    priority: "medium",
    status: "completed",
    categoryId: "cat-a",
    categoryName: "Work",
    projectId: "project-a",
    projectTitle: "Alpha",
    assignees: [{ id: "member-b", name: "Bao" }],
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
  },
];

test("task filtering combines search, kind, status, priority, category, project, and PIC", () => {
  const visible = filterPlannerItems(items, {
    query: "alpha",
    kinds: ["deadline"],
    statuses: ["pending"],
    priorities: ["high"],
    categories: ["cat-a"],
    projects: ["project-a"],
    assignees: ["member-a"],
  }, now);
  assert.deepEqual(visible.map((item) => item.id), ["late"]);
});

test("quick and date filters respect overdue, today, tomorrow, and custom boundaries", () => {
  assert.deepEqual(filterPlannerItems(items, { quick: "overdue" }, now).map((item) => item.id), ["late"]);
  assert.deepEqual(filterPlannerItems(items, { time: "today" }, now).map((item) => item.id), ["today"]);
  assert.deepEqual(filterPlannerItems(items, { time: "tomorrow" }, now).map((item) => item.id), ["tomorrow"]);
  assert.deepEqual(filterPlannerItems(items, { time: "custom", from: "2026-08-26", to: "2026-08-27" }, now).map((item) => item.id), ["late", "today"]);
  const range = timeRangeForPreset("next7", now);
  assert.equal(range.from.getDate(), 27);
  assert.equal(range.to.getDate(), 2);
});

test("every item sorting mode returns the expected stable order", () => {
  assert.deepEqual(sortPlannerItems(items, "date-asc").map((item) => item.id), ["late", "today", "tomorrow"]);
  assert.deepEqual(sortPlannerItems(items, "date-desc").map((item) => item.id), ["tomorrow", "today", "late"]);
  assert.deepEqual(sortPlannerItems(items, "title-asc").map((item) => item.id), ["today", "late", "tomorrow"]);
  assert.deepEqual(sortPlannerItems(items, "title-desc").map((item) => item.id), ["tomorrow", "late", "today"]);
  assert.deepEqual(sortPlannerItems(items, "priority-desc").map((item) => item.id), ["late", "tomorrow", "today"]);
  assert.deepEqual(sortPlannerItems(items, "priority-asc").map((item) => item.id), ["today", "tomorrow", "late"]);
  assert.deepEqual(sortPlannerItems(items, "created").map((item) => item.id), ["today", "tomorrow", "late"]);
  assert.deepEqual(sortPlannerItems(items, "updated").map((item) => item.id), ["tomorrow", "late", "today"]);
});

test("task filter URL serialization round-trips multi-select state", () => {
  const filters = taskFiltersFromSearchParams("query=alpha&quick=deadline&categories=a&categories=b&projects=none&time=custom&from=2026-08-01&to=2026-08-31&sort=updated");
  const roundTrip = taskFiltersFromSearchParams(taskFiltersToSearchParams(filters));
  assert.deepEqual(roundTrip, filters);
  assert.equal(activeTaskFilterCount(filters), 4);
});

test("combined selection filters and sorts in one pure operation", () => {
  const visible = selectPlannerItems(items, { categories: ["cat-a"], sort: "priority-asc" }, now);
  assert.deepEqual(visible.map((item) => item.id), ["tomorrow", "late"]);
});

test("category filters classify standalone work without hiding projects", () => {
  const visible = filterPlannerItems(items, { categories: ["cat-b"] }, now);
  assert.deepEqual(visible.map((item) => item.id), ["late", "today", "tomorrow"]);
  const standaloneOnly = filterPlannerItems(items, { categories: ["cat-b"], projects: ["none"] }, now);
  assert.deepEqual(standaloneOnly.map((item) => item.id), ["today"]);
});

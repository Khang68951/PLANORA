import test from "node:test";
import assert from "node:assert/strict";
import { toItemModel, validateItem } from "../lib/items.js";

const categoryId = "11111111-1111-4111-8111-111111111111";

test("a task requires a valid interval and accepts optional fields", () => {
  assert.deepEqual(validateItem({
    title: "Write report", kind: "task", description: null,
    startAt: "2026-08-26T09:00:00.000Z", endAt: "2026-08-26T10:00:00.000Z",
    status: "pending", priority: "medium", categoryId, projectId: null,
  }), {});
});

test("a task rejects missing, reversed, and deadline timestamps", () => {
  assert.ok(validateItem({ title: "Task", kind: "task", startAt: "2026-08-26T10:00:00.000Z", categoryId }).endAt);
  assert.ok(validateItem({ title: "Task", kind: "task", startAt: "2026-08-26T10:00:00.000Z", endAt: "2026-08-26T09:00:00.000Z", categoryId }).endAt);
  assert.ok(validateItem({ title: "Task", kind: "task", startAt: "2026-08-26T09:00:00.000Z", endAt: "2026-08-26T10:00:00.000Z", dueAt: "2026-08-27T00:00:00.000Z", categoryId }).dueAt);
});

test("a deadline requires dueAt and rejects task interval fields", () => {
  assert.deepEqual(validateItem({ title: "Submit report", kind: "deadline", dueAt: "2026-08-26T23:00:00.000Z", categoryId }), {});
  assert.ok(validateItem({ title: "Submit report", kind: "deadline", categoryId }).dueAt);
  assert.ok(validateItem({ title: "Submit report", kind: "deadline", dueAt: "2026-08-26T23:00:00.000Z", startAt: "2026-08-26T09:00:00.000Z", categoryId }).startAt);
});

test("database Date values remain valid during merged PATCH validation", () => {
  assert.deepEqual(validateItem({ title: "Existing", kind: "task", startAt: new Date("2026-08-26T09:00:00.000Z"), endAt: new Date("2026-08-26T10:00:00.000Z"), categoryId }), {});
});

test("API models expose only the temporal fields for their kind", () => {
  const common = { id: "item", title: "Example", description: null, status: "pending", priority: "medium", categoryId, projectId: null, createdAt: new Date("2026-08-26T08:00:00.000Z"), updatedAt: new Date("2026-08-26T08:00:00.000Z") };
  const task = toItemModel({ ...common, kind: "task", startAt: new Date("2026-08-26T09:00:00.000Z"), endAt: new Date("2026-08-26T10:00:00.000Z"), dueAt: null });
  const deadline = toItemModel({ ...common, kind: "deadline", startAt: null, endAt: null, dueAt: new Date("2026-08-26T23:00:00.000Z") });
  assert.equal(Object.hasOwn(task, "dueAt"), false);
  assert.equal(Object.hasOwn(deadline, "startAt"), false);
  assert.equal(Object.hasOwn(deadline, "endAt"), false);
  assert.equal(task.startAt, "2026-08-26T09:00:00.000Z");
  assert.equal(deadline.dueAt, "2026-08-26T23:00:00.000Z");
});

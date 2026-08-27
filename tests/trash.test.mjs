import test from "node:test";
import assert from "node:assert/strict";
import { groupTrashEntries, permanentDeleteWarning, purgeTrashBatchRecords } from "../lib/trash.js";

test("Trash groups related records by recoverable deletion batch", () => {
  const grouped = groupTrashEntries({
    projects: [{ title: "Planora", trash_batch_id: "batch-a", deleted_at: "2026-08-27T10:00:00Z" }],
    items: [
      { title: "Build", kind: "task", trash_batch_id: "batch-a", deleted_at: "2026-08-27T10:00:00Z" },
      { title: "Ship", kind: "deadline", trash_batch_id: "batch-a", deleted_at: "2026-08-27T10:00:00Z" },
      { title: "Notes", kind: "task", trash_batch_id: "batch-b", deleted_at: "2026-08-27T11:00:00Z" },
    ],
  });
  assert.deepEqual(grouped.map((entry) => entry.id), ["batch-b", "batch-a"]);
  assert.equal(grouped[1].label, "Planora");
  assert.equal(grouped[1].summary, "1 project · 1 task · 1 deadline");
  assert.deepEqual(grouped[1].counts, { categories: 0, projects: 1, tasks: 1, deadlines: 1 });
  assert.match(permanentDeleteWarning(grouped[1]), /documents, files, members, AI history/);
  assert.match(permanentDeleteWarning(grouped[1]), /cannot be undone/);
});

test("permanent Trash deletion removes project work before its project and commits once", async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.startsWith("SELECT id FROM projects")) return { rows: [{ id: "project-a" }] };
      if (sql.startsWith("SELECT project_id")) return { rows: [{ project_id: "project-a", stored_name: "file.txt" }] };
      if (sql.startsWith("DELETE FROM planner_items")) return { rowCount: 2 };
      if (sql.startsWith("DELETE FROM projects")) return { rowCount: 1 };
      if (sql.startsWith("DELETE FROM categories")) return { rowCount: 0 };
      return { rowCount: 0, rows: [] };
    },
  };
  const result = await purgeTrashBatchRecords({ client, batch: "batch-a" });
  assert.deepEqual(result.deleted, { categories: 0, projects: 1, items: 2 });
  assert.equal(result.files.length, 1);
  assert.ok(statements.findIndex((sql) => sql.startsWith("SELECT id FROM categories")) < statements.findIndex((sql) => sql.startsWith("SELECT id FROM projects")));
  assert.ok(statements.findIndex((sql) => sql.startsWith("SELECT id FROM projects")) < statements.findIndex((sql) => sql.startsWith("SELECT id FROM planner_items")));
  assert.ok(statements.indexOf("COMMIT") > statements.findIndex((sql) => sql.startsWith("DELETE FROM categories")));
  assert.equal(statements.includes("ROLLBACK"), false);
});

test("permanent Trash deletion rolls back when the batch no longer exists", async () => {
  const statements = [];
  const client = { async query(sql) { statements.push(sql); return { rowCount: 0, rows: [] }; } };
  assert.equal(await purgeTrashBatchRecords({ client, batch: "missing" }), null);
  assert.equal(statements.at(-1), "ROLLBACK");
});

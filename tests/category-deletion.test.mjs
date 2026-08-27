import test from "node:test";
import assert from "node:assert/strict";
import { reassignCategoryAndTrash } from "../lib/category-deletion.js";

test("category deletion transaction reassigns work and projects before trashing only categories", async () => {
  const calls = [];
  const client = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: [], rowCount: 0 }; } };
  await reassignCategoryAndTrash({ client, categoryIds: ["category-a"], replacementCategoryId: "category-b", trashBatchId: "batch", replaceDefault: true });
  assert.equal(calls[0].sql, "BEGIN");
  assert.match(calls[2].sql, /^UPDATE planner_items SET category_id/);
  assert.doesNotMatch(calls[2].sql, /deleted_at\s*=\s*NOW/);
  assert.match(calls[3].sql, /^UPDATE projects SET category_id/);
  assert.doesNotMatch(calls[3].sql, /deleted_at\s*=\s*NOW/);
  assert.match(calls[5].sql, /^UPDATE categories SET deleted_at/);
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("category deletion rolls back every reassignment when one statement fails", async () => {
  const calls = [];
  const client = { query: async (sql) => { calls.push(sql); if (sql.startsWith("UPDATE projects")) throw new Error("failure"); return { rows: [] }; } };
  await assert.rejects(() => reassignCategoryAndTrash({ client, categoryIds: ["category-a"], replacementCategoryId: "category-b", trashBatchId: "batch", replaceDefault: false }), /failure/);
  assert.equal(calls.at(-1), "ROLLBACK");
  assert.equal(calls.includes("COMMIT"), false);
});

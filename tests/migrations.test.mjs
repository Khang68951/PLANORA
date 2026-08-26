import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("task timestamp migration removes legacy constraints before clearing due_at", async () => {
  const migration = await readFile(new URL("../database/migrations/002_task_deadline_fields.sql", import.meta.url), "utf8");
  const dropNotNull = migration.indexOf("ALTER COLUMN due_at DROP NOT NULL");
  const dropTemporalCheck = migration.indexOf("DROP CONSTRAINT IF EXISTS planner_items_temporal_fields_check");
  const convertTasks = migration.indexOf("SET start_at = COALESCE(start_at, due_at)");
  const clearTaskDueAt = migration.indexOf("SET due_at = NULL");

  assert.ok(dropNotNull >= 0 && dropNotNull < clearTaskDueAt);
  assert.ok(dropTemporalCheck >= 0 && dropTemporalCheck < convertTasks);
  assert.ok(convertTasks < clearTaskDueAt);
});

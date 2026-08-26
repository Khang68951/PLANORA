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

test("project workspace migration includes every required relation and AI setting", async () => {
  const migration = await readFile(new URL("../database/migrations/003_project_workspace.sql", import.meta.url), "utf8");
  for (const table of ["project_members", "planner_item_assignees", "project_documents", "project_files", "project_ai_messages", "project_ai_tools"]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\b`));
  }
  assert.match(migration, /ALTER TABLE planner_settings ADD COLUMN IF NOT EXISTS ai_provider/);
  assert.match(migration, /member_id UUID NOT NULL REFERENCES project_members\(id\) ON DELETE CASCADE/);
});

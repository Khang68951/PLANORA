import test from "node:test";
import assert from "node:assert/strict";
import { executeAICommandBatch } from "../lib/ai-batch.js";

test("approval batches record partial failures and continue with independent commands", async () => {
  const applied = [];
  const failed = [];
  const outcomes = await executeAICommandBatch([{ id: "a" }, { id: "b" }, { id: "c" }], {
    claim: async () => true,
    execute: async (command) => { if (command.id === "b") throw new Error("stale work"); return { created: command.id }; },
    applied: async (command) => applied.push(command.id),
    failed: async (command) => failed.push(command.id),
  });
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ["applied", "failed", "applied"]);
  assert.deepEqual(applied, ["a", "c"]);
  assert.deepEqual(failed, ["b"]);
});

test("approval batches never execute a command that lost its pending-state claim", async () => {
  let executions = 0;
  const outcomes = await executeAICommandBatch([{ id: "already-decided" }], {
    claim: async () => false,
    execute: async () => { executions += 1; },
    applied: async () => {},
    failed: async () => {},
  });
  assert.equal(executions, 0);
  assert.equal(outcomes[0].status, "skipped");
});

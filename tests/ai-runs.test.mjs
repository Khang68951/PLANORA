import test from "node:test";
import assert from "node:assert/strict";
import { deriveAIRunStatus, eligibleBatchCommands, summarizeAICommands, toAIRunModel } from "../lib/ai-runs.js";

const commands = Array.from({ length: 12 }, (_, index) => ({
  id: `command-${index}`,
  name: index < 8 ? "work.create" : index < 11 ? "members.create" : "documents.insert",
  status: "pending",
}));

test("AI approval groups summarize and expose more than six commands", () => {
  const run = toAIRunModel({ id: "run", projectId: "project", requestMessage: "Plan it", createdAt: "2026-08-27T00:00:00Z", updatedAt: "2026-08-27T00:00:00Z" }, commands);
  assert.equal(run.commands.length, 12);
  assert.equal(run.summary, "12 proposed changes — 8 task/deadlines, 3 members, 1 document");
  assert.deepEqual(run.progress, { applied: 0, decided: 0, total: 12 });
});

test("batch approval excludes document comparison commands", () => {
  const eligible = eligibleBatchCommands(commands);
  assert.equal(eligible.length, 11);
  assert.equal(eligible.some((command) => command.name === "documents.insert"), false);
});

test("AI run outcomes distinguish complete, rejected, failed, and honest partial results", () => {
  assert.equal(deriveAIRunStatus(commands.map((command) => ({ ...command, status: "applied" }))), "complete");
  assert.equal(deriveAIRunStatus(commands.map((command) => ({ ...command, status: "discarded" }))), "rejected");
  assert.equal(deriveAIRunStatus(commands.map((command) => ({ ...command, status: "failed" }))), "failed");
  assert.equal(deriveAIRunStatus(commands.map((command, index) => ({ ...command, status: index ? "applied" : "failed" }))), "partial");
  assert.equal(deriveAIRunStatus(commands.map((command, index) => ({ ...command, status: index ? "pending" : "applied" }))), "partial");
});

test("empty and mixed approval summaries remain readable", () => {
  assert.equal(summarizeAICommands([]), "0 proposed changes");
  assert.match(summarizeAICommands(commands), /^12 proposed changes/);
});

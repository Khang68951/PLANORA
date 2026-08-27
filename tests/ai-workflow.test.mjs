import test from "node:test";
import assert from "node:assert/strict";
import { commandPlannerSystemInstruction, conversationSystemInstruction, fallbackClarificationQuestion, parseCommandPlannerResult, routeProjectAIRequest, scopedProjectContext } from "../lib/ai-workflow.js";

const catalog = [
  { name: "documents.read" },
  { name: "documents.remove" },
  { name: "files.list" },
  { name: "work.create" },
  { name: "members.list" },
  { name: "project.get" },
];

test("AI workflow routes focused requests to only relevant commands and context", () => {
  const workflow = routeProjectAIRequest("Remove the second paragraph from the document", catalog);
  assert.deepEqual(workflow.scopes, ["documents"]);
  assert.deepEqual(workflow.allowedCommands.map((command) => command.name), ["documents.read", "documents.remove"]);
  const selected = scopedProjectContext({ project: { id: "p" }, members: [], items: [], documents: [1], files: [2], readableFiles: [3] }, workflow.scopes);
  assert.deepEqual(selected, { project: { id: "p" }, documents: [1] });
});

test("AI workflow keeps broad questions multi-scope", () => {
  const workflow = routeProjectAIRequest("Summarize the project documents, files, team, and tasks", catalog);
  assert.equal(workflow.intent, "multi_scope_request");
  assert.equal(workflow.allowedCommands.length, catalog.length);
});

test("pure conversation defaults to lightweight project context", () => {
  const workflow = routeProjectAIRequest("Hello, can you help me?", catalog);
  assert.deepEqual(workflow.scopes, ["project"]);
  assert.deepEqual(workflow.allowedCommands.map((command) => command.name), ["project.get"]);
});

test("AI workflow separates conversational output from internal command planning", () => {
  const workflow = routeProjectAIRequest("Create and write a proposal document", catalog);
  const context = { project: { id: "project", name: "Code project" }, documents: [] };
  const conversation = conversationSystemInstruction({ workflow, context });
  const planner = commandPlannerSystemInstruction({ workflow, context, commandMode: "approve_changes", currentTime: "2026-08-27T00:00:00.000Z" });
  assert.match(conversation, /separate command-planner AI/);
  assert.match(conversation, /Do not emit commands/);
  assert.match(planner, /ONE documents\.create command/);
  assert.match(planner, /document.*Documents tab/i);
  assert.match(planner, /attachment.*file/i);
  assert.match(planner, /Never invent an ID/);
  assert.match(planner, /safely inferred/);
  assert.match(planner, /PIC is optional/);
  assert.match(planner, /assigneeIds/);
});

test("command planner results preserve commands or ask a concise clarification", () => {
  assert.deepEqual(parseCommandPlannerResult('{"commands":[],"clarificationQuestion":"When should it start?"}'), {
    commands: [], clarificationQuestion: "When should it start?", parseFailed: false,
  });
  assert.equal(parseCommandPlannerResult('{"commands":[').parseFailed, true);
  assert.match(fallbackClarificationQuestion([{ name: "work.create" }]), /dates or working times/i);
});

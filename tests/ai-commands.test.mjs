import test from "node:test";
import assert from "node:assert/strict";
import { AI_COMMAND_DEFINITIONS, AI_COMMAND_MODES, commandRequiresApproval, legacyProposalsToCommands, normalizeAICommandBatch, normalizeAICommands, validateAICommand } from "../lib/ai-commands.js";

const documentId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

test("AI command modes implement strict, balanced, and automatic permissions", () => {
  assert.deepEqual(AI_COMMAND_MODES, ["approve_all", "approve_changes", "auto"]);
  assert.equal(commandRequiresApproval("approve_all", "read"), true);
  assert.equal(commandRequiresApproval("approve_all", "change"), true);
  assert.equal(commandRequiresApproval("approve_changes", "read"), false);
  assert.equal(commandRequiresApproval("approve_changes", "change"), true);
  assert.equal(commandRequiresApproval("approve_changes", "destructive"), true);
  assert.equal(commandRequiresApproval("auto", "destructive"), false);
  assert.equal(commandRequiresApproval("auto", "change", "documents.update"), true);
  assert.equal(commandRequiresApproval("auto", "change", "documents.insert"), true);
  assert.equal(commandRequiresApproval("auto", "change", "documents.remove"), true);
});

test("the command registry covers project, document, file, work, and member operations", () => {
  for (const name of ["project.get", "project.search", "documents.read", "documents.create", "documents.update", "documents.insert", "documents.remove", "documents.trash", "files.list", "files.read_text", "work.list", "work.create", "work.update", "work.assign", "work.trash", "members.list", "members.create", "members.update", "members.remove"]) assert.ok(AI_COMMAND_DEFINITIONS[name]);
  assert.equal(AI_COMMAND_DEFINITIONS["documents.read"].safety, "read");
  assert.equal(AI_COMMAND_DEFINITIONS["work.trash"].safety, "destructive");
});

test("AI commands reject unknown commands, unsafe identifiers, and invalid payloads", () => {
  assert.ok(validateAICommand({ name: "database.sql", arguments: { sql: "DROP TABLE projects" } }).error);
  assert.ok(validateAICommand({ name: "documents.read", arguments: { documentId: "not-an-id" } }).error);
  assert.ok(validateAICommand({ name: "documents.create", arguments: { title: "", contentHtml: "<p>Text</p>" } }).error);
  assert.ok(validateAICommand({ name: "documents.insert", arguments: { documentId, contentHtml: "<p>Text</p>", position: "before" } }).error);
  assert.ok(validateAICommand({ name: "documents.insert", arguments: { documentId, contentHtml: "<p>Text</p>", position: "middle" } }).error);
  assert.equal(validateAICommand({ name: "documents.insert", arguments: { documentId, contentHtml: "<p>Text</p>", position: "after", anchorText: "Introduction" } }).value.name, "documents.insert");
  assert.ok(validateAICommand({ name: "documents.remove", arguments: { documentId, targetText: "Text", occurrence: 0 } }).error);
  assert.equal(validateAICommand({ name: "documents.remove", arguments: { documentId, targetText: "<p>Remove me</p>", occurrence: 2 } }).value.name, "documents.remove");
  assert.ok(validateAICommand({ name: "work.assign", arguments: { workId: documentId, assigneeIds: ["bad"] } }).error);
  assert.equal(validateAICommand({ name: "work.create", arguments: { title: "Build API", kind: "task", startAt: "2026-08-28T09:00:00.000Z", endAt: "2026-08-28T11:00:00.000Z", assigneeIds: [memberId] } }).value.arguments.assigneeIds[0], memberId);
  assert.ok(validateAICommand({ name: "work.create", arguments: { title: "Build API", kind: "task", startAt: "2026-08-28T09:00:00.000Z", endAt: "2026-08-28T11:00:00.000Z", assigneeIds: ["bad"] } }).error);
  assert.equal(validateAICommand({ name: "documents.read", arguments: { documentId }, summary: "Read the brief" }).value.summary, "Read the brief");
});

test("command normalization caps requests and supports legacy proposals", () => {
  const normalized = normalizeAICommands([
    { name: "documents.read", arguments: { documentId } },
    { name: "unknown", arguments: {} },
  ]);
  assert.equal(normalized.length, 1);
  assert.deepEqual(legacyProposalsToCommands([{ type: "createDocument", data: { title: "Brief", contentHtml: "<p>Hello</p>" } }])[0], {
    name: "documents.create", arguments: { title: "Brief", contentHtml: "<p>Hello</p>" }, summary: "documents.create: Brief",
  });
});

test("provider command aliases are normalized and validation failures stay observable", () => {
  const batch = normalizeAICommandBatch([
    { name: "documents.add_text", arguments: { document_id: documentId, content: "<p>Added</p>", location: "bottom" } },
    { name: "documents.remove_text", arguments: { docId: documentId, text: "Old", occurrence_number: "2" } },
    { name: "documents.insert", arguments: { documentId, contentHtml: "<p>Missing position</p>" } },
    { name: "documents.read", args: JSON.stringify({ documentId }) },
    { name: "work.create", arguments: { title: "Review", kind: "deadline", dueAt: "2026-08-29T09:00:00.000Z", pic_ids: [memberId] } },
  ]);
  assert.deepEqual(batch.commands.map((command) => command.name), ["documents.insert", "documents.remove", "documents.read", "work.create"]);
  assert.equal(batch.commands[0].arguments.position, "end");
  assert.equal(batch.commands[1].arguments.occurrence, 2);
  assert.deepEqual(batch.commands[3].arguments.assigneeIds, [memberId]);
  assert.match(batch.rejections[0].error, /insertion is invalid/i);
});

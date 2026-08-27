import test from "node:test";
import assert from "node:assert/strict";
import { insertDocumentHtml, materializeDocumentCommands, removeDocumentHtml } from "../lib/document-insertion.js";

test("document fragments can be inserted at the start or end", () => {
  assert.equal(insertDocumentHtml("<p>Body</p>", { contentHtml: "<h2>Start</h2>", position: "start" }), "<h2>Start</h2><p>Body</p>");
  assert.equal(insertDocumentHtml("<p>Body</p>", { contentHtml: "<p>End</p>", position: "end" }), "<p>Body</p><p>End</p>");
});

test("document text can be removed from an exact numbered occurrence", () => {
  const source = "<p>Keep</p><p>Remove me</p><p>Remove me</p>";
  assert.equal(removeDocumentHtml(source, { targetText: "<p>Remove me</p>", occurrence: 2 }), "<p>Keep</p><p>Remove me</p>");
  assert.throws(() => removeDocumentHtml(source, { targetText: "Missing", occurrence: 1 }), /not found/);
  assert.throws(() => removeDocumentHtml(source, { targetText: "Keep", occurrence: 0 }), /between 1 and 50/);
});

test("document fragments can be inserted before or after an exact anchor", () => {
  const source = "<h2>Introduction</h2><p>Existing text</p>";
  assert.equal(insertDocumentHtml(source, { contentHtml: "Draft ", position: "before", anchorText: "Existing text" }), "<h2>Introduction</h2><p>Draft Existing text</p>");
  assert.equal(insertDocumentHtml(source, { contentHtml: " expanded", position: "after", anchorText: "Existing text" }), "<h2>Introduction</h2><p>Existing text expanded</p>");
  assert.throws(() => insertDocumentHtml(source, { contentHtml: "Missing", position: "after", anchorText: "Conclusion" }), /not found/);
});

test("document commands are materialized into the exact review preview and combined safely", () => {
  const document = { id: "doc-1", contentHtml: "<p>Old sentence.</p>", updatedAt: "2026-08-27T00:00:00.000Z" };
  const result = materializeDocumentCommands([
    { name: "documents.remove", arguments: { documentId: "doc-1", targetText: "Old sentence." }, summary: "Remove old sentence" },
    { name: "documents.insert", arguments: { documentId: "doc-1", position: "end", contentHtml: "<p>New paragraph.</p>" }, summary: "Add new paragraph" },
  ], [document]);
  assert.equal(result.commands.length, 1);
  assert.equal(result.commands[0].arguments.previewContentHtml, "<p></p><p>New paragraph.</p>");
  assert.equal(result.commands[0].arguments.expectedUpdatedAt, document.updatedAt);
  assert.match(result.commands[0].summary, /Remove old sentence; Add new paragraph/);
  assert.deepEqual(result.rejections, []);
});

test("a command with a missing anchor is rejected before approval", () => {
  const result = materializeDocumentCommands([{
    name: "documents.insert",
    arguments: { documentId: "doc-1", position: "after", anchorText: "Missing", contentHtml: "New" },
    summary: "Insert text",
  }], [{ id: "doc-1", contentHtml: "Existing", updatedAt: "2026-08-27T00:00:00.000Z" }]);
  assert.equal(result.commands.length, 0);
  assert.match(result.rejections[0].error, /anchor was not found/i);
});

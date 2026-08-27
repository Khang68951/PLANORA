import test from "node:test";
import assert from "node:assert/strict";
import { canPreviewFile, isAIReadableFile, safeOriginalName, storagePath, storedFileName } from "../lib/project-files.js";

test("attachment names and generated storage names are safe", () => {
  assert.equal(safeOriginalName("../notes.txt"), "notes.txt");
  assert.equal(storedFileName("file-id", "report.final.pdf"), "file-id.pdf");
  assert.throws(() => storagePath("project-id", "../outside.txt"), /Unsafe attachment path/);
});

test("only supported text formats are passed to AI while common files can preview", () => {
  assert.equal(isAIReadableFile({ name: "notes.md", mimeType: "application/octet-stream" }), true);
  assert.equal(isAIReadableFile({ name: "paper.pdf", mimeType: "application/pdf" }), false);
  assert.equal(canPreviewFile({ name: "paper.pdf", mimeType: "application/pdf" }), true);
  assert.equal(canPreviewFile({ name: "archive.zip", mimeType: "application/zip" }), false);
});

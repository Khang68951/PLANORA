import test from "node:test";
import assert from "node:assert/strict";
import { buildDocumentDiff, documentHtmlToText } from "../lib/document-diff.js";

test("document text conversion preserves readable blocks and decodes safe entities", () => {
  assert.equal(
    documentHtmlToText(
      "<h2>Plan &amp; scope</h2><p>First<br>Second&nbsp;line</p>",
    ),
    "Plan & scope\nFirst\nSecond line",
  );
  assert.equal(documentHtmlToText("<p>Keep &#99999999;</p>"), "Keep &#99999999;");
});

test("document diff highlights additions and removals while preserving unchanged text", () => {
  const result = buildDocumentDiff(
    "<p>The agent reads files.</p>",
    "<p>The AI agent securely analyzes project files.</p>",
  );
  assert.equal(
    result.chunks
      .filter((chunk) => chunk.type !== "removed")
      .map((chunk) => chunk.text)
      .join(""),
    result.proposedText,
  );
  assert.equal(
    result.chunks
      .filter((chunk) => chunk.type !== "added")
      .map((chunk) => chunk.text)
      .join(""),
    result.currentText,
  );
  assert.ok(
    result.chunks.some(
      (chunk) => chunk.type === "added" && chunk.text.includes("AI"),
    ),
  );
  assert.ok(
    result.chunks.some(
      (chunk) => chunk.type === "removed" && chunk.text.includes("reads"),
    ),
  );
  assert.ok(
    result.chunks.some(
      (chunk) => chunk.type === "same" && chunk.text.includes("agent"),
    ),
  );
});

test("large replacements use the bounded fallback instead of an unbounded matrix", () => {
  const result = buildDocumentDiff("old text repeated", "new text repeated", {
    matrixLimit: 1,
  });
  assert.deepEqual(
    result.chunks.map((chunk) => chunk.type),
    ["removed", "added", "same"],
  );
});

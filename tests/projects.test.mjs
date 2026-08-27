import test from "node:test";
import assert from "node:assert/strict";
import { projectCreateCandidate, sanitizeDocumentHtml, validateAssigneeIds, validateDocument, validateMember, validateProject } from "../lib/projects.js";

const categoryId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

test("full project fields accept a valid project", () => {
  assert.deepEqual(validateProject({
    name: "Capstone", description: "Final submission", categoryId,
    type: "academic", startDate: "2026-08-01", deadline: "2026-09-01",
    status: "active", progress: 45,
  }), {});
});

test("new projects receive their internal compatibility category from the server", () => {
  const candidate = projectCreateCandidate({ name: "New project", categoryId: "client-value" }, categoryId);
  assert.equal(candidate.categoryId, categoryId);
  assert.equal(candidate.type, "other");
  assert.equal(candidate.status, "active");
  assert.equal(candidate.progress, 0);
});

test("project validation rejects invalid enums, progress, and date order", () => {
  const errors = validateProject({ name: "Project", categoryId, type: "unknown", status: "late", progress: 101, startDate: "2026-09-02", deadline: "2026-09-01" });
  assert.ok(errors.type);
  assert.ok(errors.status);
  assert.ok(errors.progress);
  assert.ok(errors.deadline);
});

test("members, documents, and multiple assignee identifiers are validated", () => {
  assert.deepEqual(validateMember({ name: "Alex", role: "Researcher" }), {});
  assert.deepEqual(validateDocument({ title: "Brief", contentHtml: "<p>Hello</p>" }, { contentRequired: true }), {});
  assert.equal(validateAssigneeIds([memberId]), true);
  assert.equal(validateAssigneeIds([memberId, memberId]), false);
  assert.equal(validateAssigneeIds(["not-a-uuid"]), false);
});

test("rich-text documents remove executable markup and unsafe links", () => {
  const cleaned = sanitizeDocumentHtml('<h2>Safe</h2><script>alert(1)</script><a href="javascript:alert(1)">bad</a>');
  assert.match(cleaned, /<h2>Safe<\/h2>/);
  assert.doesNotMatch(cleaned, /<script|javascript:/);
});

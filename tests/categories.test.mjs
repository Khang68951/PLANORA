import test from "node:test";
import assert from "node:assert/strict";
import { descendantsOf, suggestCategories, validateCategory, validateSettings, visibleCategoryTree } from "../lib/categories.js";

const ids = {
  root: "11111111-1111-4111-8111-111111111111",
  child: "22222222-2222-4222-8222-222222222222",
  grandchild: "33333333-3333-4333-8333-333333333333",
  work: "44444444-4444-4444-8444-444444444444",
};

test("category validation accepts folder fields and rejects unsafe values", () => {
  assert.deepEqual(validateCategory({ name: "Coursework", color: "#7558e9", parent_id: ids.root, is_hidden: false }), {});
  assert.deepEqual(validateCategory({ name: "", color: "purple", parent_id: "not-an-id", is_hidden: "yes" }), {
    name: "Enter a category name.",
    color: "Choose a six-digit hex color.",
    parent_id: "Choose a valid parent category.",
    is_hidden: "Visibility must be true or false.",
  });
});

test("settings validation enforces the supported nesting range", () => {
  assert.deepEqual(validateSettings({ default_category_id: ids.root, max_category_depth: 8 }), {});
  assert.ok(validateSettings({ max_category_depth: 9 }).max_category_depth);
  assert.ok(validateSettings({ default_category_id: "Inbox" }).default_category_id);
});

test("descendants include the selected folder at every nesting level", () => {
  const categories = [
    { id: ids.root, parent_id: null },
    { id: ids.child, parent_id: ids.root },
    { id: ids.grandchild, parent_id: ids.child },
    { id: ids.work, parent_id: null },
  ];
  assert.deepEqual([...descendantsOf(categories, ids.root)], [ids.root, ids.child, ids.grandchild]);
});

test("visible category trees mark parents and omit descendants of collapsed folders", () => {
  const categories = [
    { id: ids.root, name: "University", parent_id: null },
    { id: ids.child, name: "Writing", parent_id: ids.root },
    { id: ids.grandchild, name: "Drafts", parent_id: ids.child },
    { id: ids.work, name: "Work", parent_id: null },
  ];
  const expanded = visibleCategoryTree(categories);
  const collapsed = visibleCategoryTree(categories, new Set([ids.root]));
  assert.equal(expanded.find((category) => category.id === ids.root).hasChildren, true);
  assert.deepEqual(collapsed.map((category) => category.id), [ids.root, ids.work]);
});

test("suggestions learn from category names and examples, omit hidden folders, and cap at three", () => {
  const categories = [
    { id: ids.root, name: "University", color: "#7558e9", is_hidden: false },
    { id: ids.child, name: "Writing", color: "#3975b8", is_hidden: false },
    { id: ids.grandchild, name: "Private", color: "#000000", is_hidden: true },
    { id: ids.work, name: "Work", color: "#148a72", is_hidden: false },
    { id: "55555555-5555-4555-8555-555555555555", name: "Research", color: "#db7f45", is_hidden: false },
  ];
  const examples = [
    { title: "Draft database assignment", description: "university report", category_id: ids.root },
    { title: "Client database review", description: "", category_id: ids.work },
    { title: "Secret database notes", description: "", category_id: ids.grandchild },
  ];
  const result = suggestCategories({ title: "Database assignment", description: "Research and writing", categories, examples });
  assert.ok(result.length <= 3);
  assert.equal(result.some((category) => category.id === ids.root), true);
  assert.equal(result.some((category) => category.name === "Research"), true);
  assert.equal(result.some((category) => category.id === ids.grandchild), false);
  assert.equal(result.every((category) => !Object.hasOwn(category, "score")), true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildItemQuery } from "../lib/item-query.js";

const categoryId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";

test("server item queries parameterize supported filters, sorting, and pagination", () => {
  const query = buildItemQuery(new URLSearchParams([
    ["query", "launch"],
    ["kinds", "task"],
    ["statuses", "pending"],
    ["priorities", "high"],
    ["categories", categoryId],
    ["projects", projectId],
    ["projects", "none"],
    ["assignees", memberId],
    ["sort", "updated"],
    ["page", "2"],
    ["limit", "25"],
  ]));
  assert.deepEqual(query.errors, {});
  assert.match(query.where, /ILIKE \$1/);
  assert.match(query.where, /item\.project_id IS NOT NULL OR item\.category_id/);
  assert.match(query.where, /item\.project_id IS NULL/);
  assert.match(query.where, /planner_item_assignees/);
  assert.equal(query.orderBy, "item.updated_at DESC, item.id DESC");
  assert.equal(query.page, 2);
  assert.equal(query.limit, 25);
  assert.equal(query.values[0], "%launch%");
});

test("server item query validation rejects unsafe enums, identifiers, dates, and limits", () => {
  const query = buildItemQuery("kinds=event&categories=nope&projects=bad&from=never&sort=random&page=0&limit=999");
  assert.deepEqual(Object.keys(query.errors).sort(), ["categories", "from", "kinds", "limit", "page", "projects", "sort"]);
});

test("server custom date filters include the complete final date", () => {
  const query = buildItemQuery("from=2026-08-01&to=2026-08-31");
  assert.equal(query.values[0], "2026-08-01T00:00:00.000Z");
  assert.equal(query.values[1], "2026-08-31T23:59:59.999Z");
});

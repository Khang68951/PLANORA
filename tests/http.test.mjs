import test from "node:test";
import assert from "node:assert/strict";
import { readJson, readOptionalJson, RequestValidationError } from "../lib/request-json.js";

test("malformed JSON is classified as a client validation error", async () => {
  const request = new Request("http://localhost/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken" });
  await assert.rejects(() => readJson(request), (error) => {
    assert.equal(error instanceof RequestValidationError, true);
    assert.equal(error.errors.body, "Malformed JSON.");
    return true;
  });
});

test("valid JSON request parsing preserves the submitted object", async () => {
  const request = new Request("http://localhost/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Test" }) });
  assert.deepEqual(await readJson(request), { title: "Test" });
});

test("optional JSON accepts an empty delete preview but still rejects malformed input", async () => {
  assert.deepEqual(await readOptionalJson(new Request("http://localhost/api/categories/id", { method: "DELETE" })), {});
  await assert.rejects(() => readOptionalJson(new Request("http://localhost/api/categories/id", { method: "DELETE", body: "nope" })), RequestValidationError);
});

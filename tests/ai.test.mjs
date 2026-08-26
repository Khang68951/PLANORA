import test from "node:test";
import assert from "node:assert/strict";
import { AI_DEFAULTS, decodeProviderStream, effectiveAIConfig, extractPartialAIMessage, extractVisibleAIStreamText, normalizeAIProposals, parseAIResult, parseProviderStreamLine, validateAISettings } from "../lib/ai.js";

test("AI settings support OpenRouter and DeepSeek without accepting unsafe model identifiers", () => {
  assert.deepEqual(validateAISettings({ provider: "openrouter", model: "openrouter/free" }), {});
  assert.deepEqual(validateAISettings({ provider: "deepseek", model: "deepseek-v4-flash" }), {});
  assert.ok(validateAISettings({ provider: "other", model: "model" }).provider);
  assert.ok(validateAISettings({ provider: "openrouter", model: "bad model; rm" }).model);
});

test("AI configuration defaults to OpenRouter and preserves a stored selection", () => {
  assert.equal(AI_DEFAULTS.openrouter, process.env.OPENROUTER_MODEL || "openrouter/free");
  assert.deepEqual(effectiveAIConfig({ ai_provider: "deepseek", ai_model: "deepseek-v4-flash" }), { provider: "deepseek", model: "deepseek-v4-flash" });
});

test("AI JSON responses separate chat text from proposed changes", () => {
  const parsed = parseAIResult('```json\n{"message":"Review this first","proposedChanges":[{"type":"createTask","data":{"title":"Draft"}}]}\n```');
  assert.equal(parsed.message, "Review this first");
  assert.equal(parsed.proposedChanges.length, 1);
  assert.deepEqual(parseAIResult("Normal answer"), { message: "Normal answer", proposedChanges: [] });
  assert.deepEqual(parseAIResult('{"'), { message: "I couldn't finish that response. Please try again.", proposedChanges: [] });
});

test("streamed provider events reveal only the assistant message text", async () => {
  assert.deepEqual(parseProviderStreamLine('data: {"choices":[{"delta":{"content":"{\\\"message\\\":\\\"Hello"}}]}'), { text: '{"message":"Hello' });
  assert.deepEqual(parseProviderStreamLine("data: [DONE]"), { done: true });
  assert.equal(parseProviderStreamLine("event: ping"), null);
  assert.deepEqual(extractPartialAIMessage('{"message":"Hello\\nworld'), { text: "Hello\nworld", complete: false });
  assert.deepEqual(extractPartialAIMessage('{"message":"Hello\\nworld","proposedChanges":[]}'), { text: "Hello\nworld", complete: true });
  assert.equal(extractVisibleAIStreamText("A normal plain-text answer"), "A normal plain-text answer");
  assert.equal(extractVisibleAIStreamText('{"message":"Hidden envelope'), "Hidden envelope");
  const providerBody = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n'));
    controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"lo"}}]}\ndata: [DONE]\n'));
    controller.close();
  } });
  const tokens = [];
  for await (const token of decodeProviderStream(providerBody)) tokens.push(token);
  assert.deepEqual(tokens, ["Hel", "lo"]);
});

test("AI document updates target an existing document and carry its reviewed version", () => {
  const document = { id: "11111111-1111-4111-8111-111111111111", updatedAt: "2026-08-26T10:00:00.000Z" };
  const proposals = normalizeAIProposals([
    { type: "updateDocument", data: { documentId: document.id, contentHtml: "<p>Revised</p>" } },
    { type: "updateDocument", data: { documentId: "22222222-2222-4222-8222-222222222222", contentHtml: "<p>Wrong project</p>" } },
    { type: "deleteDocument", data: { documentId: document.id } },
  ], { documents: [document] });
  assert.deepEqual(proposals, [{ type: "updateDocument", data: { documentId: document.id, contentHtml: "<p>Revised</p>", expectedUpdatedAt: document.updatedAt } }]);
});

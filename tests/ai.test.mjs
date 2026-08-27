import test from "node:test";
import assert from "node:assert/strict";
import { AI_DEFAULTS, buildAIRequestBody, configuredAIModels, decodeProviderStream, effectiveAIConfig, extractPartialAIMessage, extractVisibleAIStreamText, normalizeAIProposals, parseAIResult, parseProviderStreamLine, validateAISettings } from "../lib/ai.js";

test("AI settings support OpenRouter, DeepSeek, and Gemini without accepting unsafe model identifiers", () => {
  assert.deepEqual(validateAISettings({ provider: "openrouter", model: "openrouter/free" }), {});
  assert.deepEqual(validateAISettings({ provider: "deepseek", model: "deepseek-v4-flash" }), {});
  assert.deepEqual(validateAISettings({ provider: "gemini", model: "gemini-2.5-flash" }), {});
  assert.ok(validateAISettings({ provider: "other", model: "model" }).provider);
  assert.ok(validateAISettings({ provider: "openrouter", model: "bad model; rm" }).model);
});

test("composer model choices come only from environment-configured providers", () => {
  assert.deepEqual(configuredAIModels({
    OPENROUTER_MODEL: "openrouter/free", OPENROUTER_API_KEY: "secret",
    DEEPSEEK_MODEL: "bad model", DEEPSEEK_API_KEY: "secret",
    GEMINI_MODEL: "gemini-2.5-flash", GEMINI_API_KEY: "",
  }), [
    { provider: "openrouter", model: "openrouter/free", keyConfigured: true },
    { provider: "gemini", model: "gemini-2.5-flash", keyConfigured: false },
  ]);
});

test("AI configuration defaults to Gemini and preserves a stored selection", () => {
  assert.equal(AI_DEFAULTS.openrouter, process.env.OPENROUTER_MODEL || "openrouter/free");
  assert.equal(AI_DEFAULTS.gemini, process.env.GEMINI_MODEL || "gemini-2.5-flash");
  assert.deepEqual(effectiveAIConfig(), { provider: "gemini", model: AI_DEFAULTS.gemini });
  assert.deepEqual(effectiveAIConfig({ ai_provider: "deepseek", ai_model: "deepseek-v4-flash" }), { provider: "deepseek", model: "deepseek-v4-flash" });
});

test("provider requests require JSON output and keep Gemini system instructions separate", () => {
  const messages = [{ role: "system", content: "Return JSON." }, { role: "user", content: "Hello" }];
  const gemini = buildAIRequestBody({ provider: "gemini", model: "gemini-2.5-flash", messages });
  assert.equal(gemini.generationConfig.responseMimeType, "application/json");
  assert.equal(gemini.systemInstruction.parts[0].text, "Return JSON.");
  assert.deepEqual(gemini.contents.map((entry) => entry.role), ["user"]);
  assert.deepEqual(buildAIRequestBody({ provider: "openrouter", model: "openrouter/free", messages }).response_format, { type: "json_object" });
  assert.deepEqual(buildAIRequestBody({ provider: "openrouter", model: "openrouter/free", messages }).provider, { require_parameters: true });
  const deepseek = buildAIRequestBody({ provider: "deepseek", model: "deepseek-v4-flash", messages });
  assert.deepEqual(deepseek.response_format, { type: "json_object" });
  assert.deepEqual(deepseek.thinking, { type: "disabled" });
  assert.equal(buildAIRequestBody({ provider: "gemini", model: "gemini-2.5-flash", messages, maxTokens: 6000 }).generationConfig.maxOutputTokens, 6000);
});

test("AI JSON responses separate chat text from proposed changes", () => {
  const parsed = parseAIResult('```json\n{"message":"Review this first","proposedChanges":[{"type":"createTask","data":{"title":"Draft"}}]}\n```');
  assert.equal(parsed.message, "Review this first");
  assert.equal(parsed.proposedChanges.length, 1);
  assert.deepEqual(parseAIResult("Normal answer"), { message: "Normal answer", proposedChanges: [], commands: [] });
  assert.deepEqual(parseAIResult('{"'), { message: "I couldn't finish that response. Please try again.", proposedChanges: [], commands: [] });
  assert.equal(parseAIResult('{"message":"Review","command":{"name":"documents.list","arguments":{}}}').commands.length, 1);
});

test("provider tool-code blocks become commands instead of visible chat text", () => {
  const content = '<|tool_code|>{"name":"documents.insert","arguments":{"documentId":"052054b5-49c8-4be0-9f84-c0f91b90379f","position":"end","contentHtml":"\\<p>Added\\</p>"},"summary":"Add text"}<|tool_code|>';
  assert.equal(extractVisibleAIStreamText(content), "");
  assert.equal(extractVisibleAIStreamText("Ready <|tool_"), "Ready");
  const parsed = parseAIResult(content);
  assert.equal(parsed.message, "I prepared a project change for your review.");
  assert.equal(parsed.commands.length, 1);
  assert.equal(parsed.commands[0].name, "documents.insert");
  assert.equal(parsed.commands[0].arguments.contentHtml, "<p>Added</p>");
  assert.equal(parseAIResult("<|tool_code|>{broken<|tool_code|>").message, "I couldn't prepare that project change. Please try again.");
});

test("structured responses repair provider-escaped HTML without losing commands", () => {
  const parsed = parseAIResult('{"message":"Review this change","commands":[{"name":"documents.insert","arguments":{"documentId":"11111111-1111-4111-8111-111111111111","position":"end","contentHtml":"\\<p>Added\\</p>"},"summary":"Add a paragraph"}]}');
  assert.equal(parsed.commands.length, 1);
  assert.equal(parsed.commands[0].arguments.contentHtml, "<p>Added</p>");
});

test("streamed provider events reveal only the assistant message text", async () => {
  assert.deepEqual(parseProviderStreamLine('data: {"choices":[{"delta":{"content":"{\\\"message\\\":\\\"Hello"}}]}'), { text: '{"message":"Hello' });
  assert.deepEqual(parseProviderStreamLine("data: [DONE]"), { done: true });
  assert.deepEqual(parseProviderStreamLine('data: {"candidates":[{"content":{"parts":[{"text":"Gem"},{"text":"ini"}]}}]}'), { text: "Gemini" });
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

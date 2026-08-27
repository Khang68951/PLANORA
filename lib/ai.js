export const AI_PROVIDERS = ["openrouter", "deepseek", "gemini"];
export const AI_DEFAULTS = {
  openrouter: process.env.OPENROUTER_MODEL || "openrouter/free",
  deepseek: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
  gemini: process.env.GEMINI_MODEL || "gemini-2.5-flash",
};

const AI_ENVIRONMENT_FIELDS = {
  openrouter: { model: "OPENROUTER_MODEL", key: "OPENROUTER_API_KEY" },
  deepseek: { model: "DEEPSEEK_MODEL", key: "DEEPSEEK_API_KEY" },
  gemini: { model: "GEMINI_MODEL", key: "GEMINI_API_KEY" },
};

export function configuredAIModels(environment = process.env) {
  return AI_PROVIDERS.flatMap((provider) => {
    const fields = AI_ENVIRONMENT_FIELDS[provider];
    const model = environment[fields.model]?.trim();
    if (!model || !/^[a-zA-Z0-9._:/-]{1,120}$/.test(model)) return [];
    return [{ provider, model, keyConfigured: Boolean(environment[fields.key]?.trim()) }];
  });
}

export function validateAISettings(body) {
  const errors = {};
  if (!AI_PROVIDERS.includes(body.provider)) errors.provider = "Choose OpenRouter, DeepSeek, or Gemini.";
  if (typeof body.model !== "string" || !/^[a-zA-Z0-9._:/-]{1,120}$/.test(body.model)) errors.model = "Enter a valid model identifier.";
  return errors;
}

export function effectiveAIConfig(settings = {}) {
  const envProvider = AI_PROVIDERS.includes(process.env.AI_PROVIDER) ? process.env.AI_PROVIDER : "gemini";
  const provider = AI_PROVIDERS.includes(settings.ai_provider) ? settings.ai_provider : envProvider;
  return { provider, model: settings.ai_model || AI_DEFAULTS[provider] };
}

export function parseProviderStreamLine(line) {
  const value = line.trim();
  if (!value.startsWith("data:")) return null;
  const data = value.slice(5).trim();
  if (!data || data === "[DONE]") return data === "[DONE]" ? { done: true } : null;
  try {
    const parsed = JSON.parse(data);
    const text = parsed.choices?.[0]?.delta?.content
      ?? parsed.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
    return typeof text === "string" && text ? { text } : null;
  } catch { return null; }
}

export async function* decodeProviderStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = done ? "" : lines.pop();
    for (const line of lines) {
      const event = parseProviderStreamLine(line);
      if (event?.done) return;
      if (event?.text) yield event.text;
    }
    if (done) return;
  }
}

export function buildAIRequestBody({ provider, model, messages, maxTokens = 2400 }) {
  const systemText = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  if (provider === "gemini") {
    return {
      ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
      contents: messages.filter((message) => message.role !== "system").map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      generationConfig: { maxOutputTokens: maxTokens, responseMimeType: "application/json" },
    };
  }
  return {
    model,
    messages,
    stream: true,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    ...(provider === "openrouter" ? { provider: { require_parameters: true } } : {}),
    ...(provider === "deepseek" ? { thinking: { type: "disabled" } } : {}),
  };
}

export async function openProjectChatStream({ provider, model, messages, maxTokens = 2400, signal }) {
  const isOpenRouter = provider === "openrouter";
  const isGemini = provider === "gemini";
  const keyName = isOpenRouter ? "OPENROUTER_API_KEY" : isGemini ? "GEMINI_API_KEY" : "DEEPSEEK_API_KEY";
  const apiKey = process.env[keyName];
  if (!apiKey) throw new Error(`${keyName} is not configured.`);
  const endpoint = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : isGemini
      ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`
      : "https://api.deepseek.com/chat/completions";
  const requestBody = buildAIRequestBody({ provider, model, messages, maxTokens });
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...(isGemini ? {} : { "Authorization": `Bearer ${apiKey}` }),
        "Content-Type": "application/json",
        ...(isGemini ? { "x-goog-api-key": apiKey } : {}),
        ...(isOpenRouter ? { "HTTP-Referer": "http://localhost:3000", "X-OpenRouter-Title": "Planora" } : {}),
      },
      body: JSON.stringify(requestBody),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    });
  } catch (error) {
    if (error.name === "TimeoutError") throw new Error(`${provider} took longer than 90 seconds. Try again or choose another configured model.`);
    if (error.name === "AbortError") throw new Error("The AI request was cancelled.");
    throw new Error(`${provider} could not be reached: ${error.message}`);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `${provider} returned HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error(`${provider} returned an empty response stream.`);
  return decodeProviderStream(response.body);
}

export async function collectProjectAIResponse(config) {
  const stream = await openProjectChatStream(config);
  let content = "";
  for await (const token of stream) content += token;
  if (!content.trim()) throw new Error(`${config.provider} returned an empty response.`);
  return content;
}

export function extractPartialAIMessage(content) {
  const match = /"message"\s*:\s*"/.exec(content);
  if (!match) return { text: "", complete: false };
  let text = "";
  for (let index = match.index + match[0].length; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') return { text, complete: true };
    if (character !== "\\") { text += character; continue; }
    if (index + 1 >= content.length) return { text, complete: false };
    const escaped = content[++index];
    const simple = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
    if (escaped !== "u") { text += simple[escaped] ?? escaped; continue; }
    const code = content.slice(index + 1, index + 5);
    if (!/^[0-9a-f]{4}$/i.test(code)) return { text, complete: false };
    text += String.fromCharCode(Number.parseInt(code, 16));
    index += 4;
  }
  return { text, complete: false };
}

export function extractVisibleAIStreamText(content) {
  const marker = "<|tool_code|>";
  const toolMarker = content.indexOf(marker);
  if (toolMarker >= 0) return content.slice(0, toolMarker).trimEnd();
  for (let length = Math.min(marker.length - 1, content.length); length > 0; length -= 1) {
    if (content.endsWith(marker.slice(0, length))) return content.slice(0, -length).trimEnd();
  }
  if (/"message"\s*:\s*"/.test(content)) return extractPartialAIMessage(content).text;
  if (/^\s*(?:```(?:json)?\s*)?[{[]/i.test(content) || /^\s*`{1,3}\s*$/.test(content)) return "";
  return content;
}

export function parseAIResult(content) {
  const toolCommands = [];
  const toolPattern = /<\|tool_code\|>\s*([\s\S]*?)\s*(?:<\|tool_code\|>|<\|\/tool_code\|>)/g;
  let toolMatch;
  while ((toolMatch = toolPattern.exec(content))) {
    try {
      const parsed = JSON.parse(toolMatch[1].replace(/\\([<>])/g, "$1"));
      if (parsed && typeof parsed === "object") toolCommands.push(parsed);
    } catch {
      // Invalid provider tool blocks are handled by the normal readable fallback below.
    }
  }
  if (toolCommands.length) {
    const visible = content.replace(toolPattern, "").trim();
    return {
      message: visible || "I prepared a project change for your review.",
      proposedChanges: [],
      commands: toolCommands,
    };
  }
  if (content.includes("<|tool_code|>")) {
    return {
      message: "I couldn't prepare that project change. Please try again.",
      proposedChanges: [],
      commands: [],
    };
  }
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || content;
  try {
    const parsed = JSON.parse(candidate.replace(/\\([<>])/g, "$1"));
    const parsedCommands = Array.isArray(parsed.commands)
      ? parsed.commands
      : parsed.commands && typeof parsed.commands === "object"
        ? [parsed.commands]
        : parsed.command && typeof parsed.command === "object"
          ? [parsed.command]
          : [];
    return {
      message: typeof parsed.message === "string" ? parsed.message : content,
      proposedChanges: Array.isArray(parsed.proposedChanges) ? parsed.proposedChanges : [],
      commands: parsedCommands,
    };
  } catch {
    const partial = extractPartialAIMessage(candidate).text.trim();
    if (partial) return { message: partial, proposedChanges: [], commands: [], commandParseFailed: /"commands"\s*:/.test(candidate) };
    if (/^\s*(?:```(?:json)?\s*)?[{[]/i.test(content)) return { message: "I couldn't finish that response. Please try again.", proposedChanges: [], commands: [] };
    return { message: content.trim(), proposedChanges: [], commands: [] };
  }
}

export function normalizeAIProposals(proposals, { documents = [] } = {}) {
  if (!Array.isArray(proposals)) return [];
  const documentVersions = new Map(documents.map((document) => [document.id, document.updatedAt]));
  return proposals.slice(0, 20).flatMap((proposal) => {
    if (!proposal || typeof proposal !== "object" || !proposal.data || typeof proposal.data !== "object") return [];
    if (["createTask", "createDeadline", "createDocument"].includes(proposal.type)) return [proposal];
    if (proposal.type !== "updateDocument") return [];
    const { documentId, title, contentHtml } = proposal.data;
    if (!documentVersions.has(documentId) || typeof contentHtml !== "string" || contentHtml.length > 500_000) return [];
    if (title !== undefined && (typeof title !== "string" || !title.trim() || title.trim().length > 120)) return [];
    return [{
      type: "updateDocument",
      data: {
        documentId,
        ...(title === undefined ? {} : { title: title.trim() }),
        contentHtml,
        expectedUpdatedAt: documentVersions.get(documentId),
      },
    }];
  });
}

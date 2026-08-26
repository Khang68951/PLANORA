export const AI_PROVIDERS = ["openrouter", "deepseek"];
export const AI_DEFAULTS = {
  openrouter: process.env.OPENROUTER_MODEL || "openrouter/free",
  deepseek: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
};

export function validateAISettings(body) {
  const errors = {};
  if (!AI_PROVIDERS.includes(body.provider)) errors.provider = "Choose OpenRouter or DeepSeek.";
  if (typeof body.model !== "string" || !/^[a-zA-Z0-9._:/-]{1,120}$/.test(body.model)) errors.model = "Enter a valid model identifier.";
  return errors;
}

export function effectiveAIConfig(settings = {}) {
  const envProvider = AI_PROVIDERS.includes(process.env.AI_PROVIDER) ? process.env.AI_PROVIDER : "openrouter";
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
    const text = parsed.choices?.[0]?.delta?.content;
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

export async function openProjectChatStream({ provider, model, messages }) {
  const isOpenRouter = provider === "openrouter";
  const apiKey = isOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error(`${isOpenRouter ? "OPENROUTER_API_KEY" : "DEEPSEEK_API_KEY"} is not configured.`);
  const endpoint = isOpenRouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.deepseek.com/chat/completions";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(isOpenRouter ? { "HTTP-Referer": "http://localhost:3000", "X-OpenRouter-Title": "Planora" } : {}),
    },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 1800, ...(isOpenRouter ? {} : { thinking: { type: "disabled" } }) }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `${provider} returned HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error(`${provider} returned an empty response stream.`);
  return decodeProviderStream(response.body);
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
  if (/"message"\s*:\s*"/.test(content)) return extractPartialAIMessage(content).text;
  if (/^\s*(?:```(?:json)?\s*)?[{[]/i.test(content) || /^\s*`{1,3}\s*$/.test(content)) return "";
  return content;
}

export function parseAIResult(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || content;
  try {
    const parsed = JSON.parse(candidate);
    return { message: typeof parsed.message === "string" ? parsed.message : content, proposedChanges: Array.isArray(parsed.proposedChanges) ? parsed.proposedChanges : [] };
  } catch {
    const partial = extractPartialAIMessage(candidate).text.trim();
    if (partial) return { message: partial, proposedChanges: [] };
    if (/^\s*(?:```(?:json)?\s*)?[{[]/i.test(content)) return { message: "I couldn't finish that response. Please try again.", proposedChanges: [] };
    return { message: content.trim(), proposedChanges: [] };
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

export class RequestValidationError extends Error {
  constructor(message, errors = {}) {
    super(message);
    this.name = "RequestValidationError";
    this.errors = errors;
  }
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new RequestValidationError("The request body must be valid JSON.", { body: "Malformed JSON." });
  }
}

export async function readOptionalJson(request) {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestValidationError("The request body must be valid JSON.", { body: "Malformed JSON." });
  }
}

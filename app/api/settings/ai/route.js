import { NextResponse } from "next/server";
import { configuredAIModels, effectiveAIConfig, validateAISettings } from "@/lib/ai";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const settings = (await query("SELECT ai_provider, ai_model FROM planner_settings WHERE id = 1")).rows[0] || {};
    return NextResponse.json({ config: effectiveAIConfig(settings), models: configuredAIModels(), providers: { openrouter: { defaultModel: process.env.OPENROUTER_MODEL || "openrouter/free", keyConfigured: Boolean(process.env.OPENROUTER_API_KEY) }, deepseek: { defaultModel: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash", keyConfigured: Boolean(process.env.DEEPSEEK_API_KEY) }, gemini: { defaultModel: process.env.GEMINI_MODEL || "gemini-2.5-flash", keyConfigured: Boolean(process.env.GEMINI_API_KEY) } } });
  } catch (error) { console.error("GET /api/settings/ai", error); return NextResponse.json({ error: "AI settings could not be loaded." }, { status: 500 }); }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const errors = validateAISettings(body);
    if (!configuredAIModels().some((entry) => entry.provider === body.provider && entry.model === body.model && entry.keyConfigured)) errors.model = "Choose a model configured with an API key in .env.local.";
    if (Object.keys(errors).length) return NextResponse.json({ error: "Please check the AI settings.", errors }, { status: 400 });
    const result = await query("UPDATE planner_settings SET ai_provider = $1, ai_model = $2, updated_at = NOW() WHERE id = 1 RETURNING ai_provider, ai_model", [body.provider, body.model]);
    return NextResponse.json({ config: effectiveAIConfig(result.rows[0]) });
  } catch (error) { console.error("PATCH /api/settings/ai", error); return NextResponse.json({ error: "AI settings could not be saved." }, { status: 500 }); }
}

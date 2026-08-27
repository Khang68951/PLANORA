ALTER TABLE planner_settings DROP CONSTRAINT IF EXISTS planner_settings_ai_provider_check;
ALTER TABLE planner_settings ADD CONSTRAINT planner_settings_ai_provider_check
  CHECK (ai_provider IS NULL OR ai_provider IN ('openrouter', 'deepseek', 'gemini'));

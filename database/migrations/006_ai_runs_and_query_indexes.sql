CREATE TABLE IF NOT EXISTS project_ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  request_message TEXT NOT NULL CHECK (char_length(request_message) BETWEEN 1 AND 4000),
  response_message TEXT,
  intent VARCHAR(80),
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning', 'pending', 'running', 'complete', 'partial', 'failed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_ai_commands ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES project_ai_runs(id) ON DELETE CASCADE;
ALTER TABLE project_ai_commands ALTER COLUMN request_message DROP NOT NULL;
ALTER TABLE project_ai_commands DROP CONSTRAINT IF EXISTS project_ai_commands_request_message_check;

INSERT INTO project_ai_runs (id, project_id, request_message, status, created_at, updated_at)
SELECT command.id, command.project_id, command.request_message,
  CASE
    WHEN command.status IN ('pending', 'running') THEN 'pending'
    WHEN command.status = 'failed' THEN 'failed'
    WHEN command.status = 'discarded' THEN 'rejected'
    ELSE 'complete'
  END,
  command.created_at,
  COALESCE(command.decided_at, command.created_at)
FROM project_ai_commands command
WHERE command.run_id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE project_ai_commands SET run_id = id, request_message = NULL WHERE run_id IS NULL;
ALTER TABLE project_ai_commands ALTER COLUMN run_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS project_ai_runs_project_page_idx
  ON project_ai_runs (project_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS project_ai_runs_pending_idx
  ON project_ai_runs (project_id, status, updated_at DESC)
  WHERE status IN ('planning', 'pending', 'running', 'partial');
CREATE INDEX IF NOT EXISTS project_ai_commands_run_page_idx
  ON project_ai_commands (run_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS planner_items_active_schedule_idx
  ON planner_items (COALESCE(end_at, due_at), id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS planner_items_active_updated_idx
  ON planner_items (updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION planora_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS categories_touch_updated_at ON categories;
CREATE TRIGGER categories_touch_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION planora_touch_updated_at();
DROP TRIGGER IF EXISTS planner_items_touch_updated_at ON planner_items;
CREATE TRIGGER planner_items_touch_updated_at BEFORE UPDATE ON planner_items FOR EACH ROW EXECUTE FUNCTION planora_touch_updated_at();
DROP TRIGGER IF EXISTS projects_touch_updated_at ON projects;
CREATE TRIGGER projects_touch_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION planora_touch_updated_at();
DROP TRIGGER IF EXISTS planner_settings_touch_updated_at ON planner_settings;
CREATE TRIGGER planner_settings_touch_updated_at BEFORE UPDATE ON planner_settings FOR EACH ROW EXECUTE FUNCTION planora_touch_updated_at();
DROP TRIGGER IF EXISTS project_members_touch_updated_at ON project_members;
CREATE TRIGGER project_members_touch_updated_at BEFORE UPDATE ON project_members FOR EACH ROW EXECUTE FUNCTION planora_touch_updated_at();
DROP TRIGGER IF EXISTS project_documents_touch_updated_at ON project_documents;
CREATE TRIGGER project_documents_touch_updated_at BEFORE UPDATE ON project_documents FOR EACH ROW EXECUTE FUNCTION planora_touch_updated_at();
DROP TRIGGER IF EXISTS project_ai_runs_touch_updated_at ON project_ai_runs;
CREATE TRIGGER project_ai_runs_touch_updated_at BEFORE UPDATE ON project_ai_runs FOR EACH ROW EXECUTE FUNCTION planora_touch_updated_at();

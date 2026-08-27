ALTER TABLE projects ADD COLUMN IF NOT EXISTS ai_command_mode VARCHAR(24) NOT NULL DEFAULT 'approve_changes';
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_ai_command_mode_check;
ALTER TABLE projects ADD CONSTRAINT projects_ai_command_mode_check
  CHECK (ai_command_mode IN ('approve_all', 'approve_changes', 'auto'));

ALTER TABLE project_members ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE project_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE project_ai_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  safety VARCHAR(16) NOT NULL CHECK (safety IN ('read', 'change', 'destructive')),
  mode VARCHAR(24) NOT NULL CHECK (mode IN ('approve_all', 'approve_changes', 'auto')),
  arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary VARCHAR(240) NOT NULL,
  request_message TEXT NOT NULL CHECK (char_length(request_message) BETWEEN 1 AND 4000),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'applied', 'discarded', 'failed', 'undone')),
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE INDEX project_ai_commands_project_idx
  ON project_ai_commands (project_id, created_at DESC);
CREATE INDEX project_ai_commands_pending_idx
  ON project_ai_commands (project_id, status) WHERE status = 'pending';

ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(24) NOT NULL DEFAULT 'other';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_project_type_check;
ALTER TABLE projects ADD CONSTRAINT projects_project_type_check CHECK (project_type IN ('academic', 'work', 'personal', 'research', 'other'));
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN ('planned', 'active', 'on_hold', 'completed'));
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_progress_check;
ALTER TABLE projects ADD CONSTRAINT projects_progress_check CHECK (progress BETWEEN 0 AND 100);
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_date_order_check;
ALTER TABLE projects ADD CONSTRAINT projects_date_order_check CHECK (start_date IS NULL OR deadline IS NULL OR deadline >= start_date);

CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  role VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE planner_item_assignees (
  item_id UUID NOT NULL REFERENCES planner_items(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES project_members(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, member_id)
);

CREATE TABLE project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  content_html TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL UNIQUE,
  mime_type VARCHAR(150) NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role VARCHAR(12) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_ai_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
  prompt TEXT NOT NULL CHECK (char_length(trim(prompt)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

ALTER TABLE planner_settings ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(16);
ALTER TABLE planner_settings ADD COLUMN IF NOT EXISTS ai_model VARCHAR(120);
ALTER TABLE planner_settings DROP CONSTRAINT IF EXISTS planner_settings_ai_provider_check;
ALTER TABLE planner_settings ADD CONSTRAINT planner_settings_ai_provider_check CHECK (ai_provider IS NULL OR ai_provider IN ('openrouter', 'deepseek'));

CREATE INDEX IF NOT EXISTS project_members_project_idx ON project_members (project_id);
CREATE INDEX IF NOT EXISTS planner_item_assignees_member_idx ON planner_item_assignees (member_id);
CREATE INDEX IF NOT EXISTS project_documents_project_idx ON project_documents (project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS project_files_project_idx ON project_files (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_ai_messages_project_idx ON project_ai_messages (project_id, created_at);
CREATE INDEX IF NOT EXISTS project_ai_tools_project_idx ON project_ai_tools (project_id);

INSERT INTO project_members (project_id, name, role)
SELECT id, 'You', 'Project owner' FROM projects project
WHERE project.title = 'University capstone' AND project.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM project_members member WHERE member.project_id = project.id);

INSERT INTO project_documents (project_id, title, content_html)
SELECT id, 'Project brief', '<h2>Capstone goal</h2><p>Deliver a clear, evidence-backed final project.</p>' FROM projects project
WHERE project.title = 'University capstone' AND project.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM project_documents document WHERE document.project_id = project.id);

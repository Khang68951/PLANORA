CREATE TABLE IF NOT EXISTS planner_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(120) NOT NULL CHECK (char_length(trim(title)) > 0),
  description TEXT,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('task', 'deadline')),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  category VARCHAR(40) NOT NULL DEFAULT 'Personal',
  priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT planner_items_temporal_fields_check CHECK (
    (kind = 'task' AND start_at IS NOT NULL AND end_at IS NOT NULL AND due_at IS NULL AND end_at > start_at) OR
    (kind = 'deadline' AND due_at IS NOT NULL AND start_at IS NULL AND end_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS planner_items_due_at_idx ON planner_items (due_at);
CREATE INDEX IF NOT EXISTS planner_items_status_idx ON planner_items (status);

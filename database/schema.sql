CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS planner_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(120) NOT NULL CHECK (char_length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('task', 'deadline')),
  due_at TIMESTAMPTZ NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'Personal',
  priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS planner_items_due_at_idx ON planner_items (due_at);
CREATE INDEX IF NOT EXISTS planner_items_status_idx ON planner_items (status);

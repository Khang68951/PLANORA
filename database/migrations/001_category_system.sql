CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(60) NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
  color VARCHAR(7) NOT NULL DEFAULT '#5e6c70' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  parent_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  trash_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX categories_active_sibling_name_idx
  ON categories (parent_id, lower(name)) NULLS NOT DISTINCT
  WHERE deleted_at IS NULL;
CREATE INDEX categories_parent_idx ON categories (parent_id);
CREATE INDEX categories_trash_batch_idx ON categories (trash_batch_id) WHERE trash_batch_id IS NOT NULL;

INSERT INTO categories (name, color)
SELECT DISTINCT trim(category),
  CASE trim(category)
    WHEN 'University' THEN '#7558e9'
    WHEN 'Work' THEN '#148a72'
    WHEN 'Planning' THEN '#db7f45'
    WHEN 'Personal' THEN '#3975b8'
    ELSE '#5e6c70'
  END
FROM planner_items
WHERE trim(category) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, color)
VALUES
  ('Inbox', '#5e6c70'),
  ('University', '#7558e9'),
  ('Work', '#148a72'),
  ('Planning', '#db7f45'),
  ('Personal', '#3975b8')
ON CONFLICT DO NOTHING;

CREATE TABLE planner_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  max_category_depth SMALLINT NOT NULL DEFAULT 4 CHECK (max_category_depth BETWEEN 1 AND 8),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO planner_settings (id, default_category_id)
SELECT 1, id FROM categories
ORDER BY CASE WHEN name = 'Personal' THEN 0 WHEN name = 'Inbox' THEN 1 ELSE 2 END, created_at
LIMIT 1;

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(120) NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  deleted_at TIMESTAMPTZ,
  trash_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE planner_items ADD COLUMN category_id UUID;
ALTER TABLE planner_items ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE planner_items ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE planner_items ADD COLUMN trash_batch_id UUID;

UPDATE planner_items AS item
SET category_id = category_record.id
FROM categories AS category_record
WHERE lower(category_record.name) = lower(trim(item.category));

UPDATE planner_items
SET category_id = (SELECT default_category_id FROM planner_settings WHERE id = 1)
WHERE category_id IS NULL;

ALTER TABLE planner_items ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE planner_items ADD CONSTRAINT planner_items_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT;
ALTER TABLE planner_items DROP COLUMN category;

CREATE INDEX planner_items_category_idx ON planner_items (category_id) WHERE deleted_at IS NULL;
CREATE INDEX planner_items_project_idx ON planner_items (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX planner_items_trash_batch_idx ON planner_items (trash_batch_id) WHERE trash_batch_id IS NOT NULL;
CREATE INDEX projects_category_idx ON projects (category_id) WHERE deleted_at IS NULL;
CREATE INDEX projects_trash_batch_idx ON projects (trash_batch_id) WHERE trash_batch_id IS NOT NULL;

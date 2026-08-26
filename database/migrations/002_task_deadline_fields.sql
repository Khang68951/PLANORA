ALTER TABLE planner_items ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;
ALTER TABLE planner_items ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;

ALTER TABLE planner_items ALTER COLUMN description DROP NOT NULL;
ALTER TABLE planner_items ALTER COLUMN description DROP DEFAULT;
ALTER TABLE planner_items ALTER COLUMN due_at DROP NOT NULL;
ALTER TABLE planner_items DROP CONSTRAINT IF EXISTS planner_items_temporal_fields_check;

UPDATE planner_items
SET start_at = COALESCE(start_at, due_at),
    end_at = COALESCE(end_at, due_at + INTERVAL '1 hour')
WHERE kind = 'task';

UPDATE planner_items
SET due_at = NULL
WHERE kind = 'task';

UPDATE planner_items
SET description = NULL
WHERE description = '';

ALTER TABLE planner_items ADD CONSTRAINT planner_items_temporal_fields_check CHECK (
  (
    kind = 'task' AND
    start_at IS NOT NULL AND
    end_at IS NOT NULL AND
    due_at IS NULL AND
    end_at > start_at
  ) OR (
    kind = 'deadline' AND
    due_at IS NOT NULL AND
    start_at IS NULL AND
    end_at IS NULL
  )
);

CREATE INDEX IF NOT EXISTS planner_items_start_at_idx ON planner_items (start_at) WHERE kind = 'task';
CREATE INDEX IF NOT EXISTS planner_items_end_at_idx ON planner_items (end_at) WHERE kind = 'task';

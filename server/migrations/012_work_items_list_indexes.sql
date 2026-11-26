-- Speed up workspace bootstrap + paged work-item lists
CREATE INDEX IF NOT EXISTS work_items_closed_idx ON work_items (closed);
CREATE INDEX IF NOT EXISTS work_items_closed_assignee_idx ON work_items (closed, assignee_id);
CREATE INDEX IF NOT EXISTS work_items_track_idx ON work_items ((data->>'track'));
CREATE INDEX IF NOT EXISTS work_items_op_project_idx ON work_items ((data->>'opProject'));
CREATE INDEX IF NOT EXISTS work_items_updated_at_idx ON work_items (updated_at DESC);

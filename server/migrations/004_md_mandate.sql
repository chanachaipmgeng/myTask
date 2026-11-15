-- Migration 004: MD Mandate & Auto-Shift Fields

ALTER TABLE work_items ADD COLUMN IF NOT EXISTS is_md_direct boolean NOT NULL DEFAULT false;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS paused_reason text;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS original_first_due_on text;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS paused_days numeric(5,2) NOT NULL DEFAULT 0.00;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS paused_by_ticket_id text;

-- Migration 014: Performance Indexes & Sequence Integrity (v2.3.1)

-- 1. Workspace ticket slice composite index (closed, updated_at DESC, id ASC)
CREATE INDEX IF NOT EXISTS work_items_closed_updated_id_idx
  ON work_items (closed, updated_at DESC, id ASC);

-- 2. Missing JSONB expression indexes used by OrgController & WorkItemsRepo
CREATE INDEX IF NOT EXISTS work_items_project_idx
  ON work_items ((data->>'project'));

CREATE INDEX IF NOT EXISTS work_items_type_idx
  ON work_items ((data->>'type'));

-- 3. Git branches ordering index
CREATE INDEX IF NOT EXISTS git_branches_updated_at_idx
  ON git_branches (updated_at DESC);

-- 4. Fix dispute_code_seq to use MAX numeric suffix instead of COUNT(*)
SELECT setval(
  'dispute_code_seq',
  GREATEST(
    COALESCE(
      (SELECT MAX(substring(dispute_code FROM '[0-9]+$')::integer) FROM ticket_disputes WHERE dispute_code ~ '[0-9]+$'),
      0
    ),
    1
  ),
  (SELECT EXISTS(SELECT 1 FROM ticket_disputes))
);

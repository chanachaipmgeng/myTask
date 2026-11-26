-- Migration 013: Enterprise Indexes, Constraints, Sequences & Visibility Foreign Keys (v2.3.0)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. audit_log query performance
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_at_idx ON audit_log (actor_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action);

-- 2. work_items expression & trigram search indexes (complementing 012)
CREATE INDEX IF NOT EXISTS work_items_workflow_status_idx ON work_items ((data->>'workflowStatus'));
CREATE INDEX IF NOT EXISTS work_items_due_on_idx ON work_items ((data->>'dueOn'));
CREATE INDEX IF NOT EXISTS work_items_first_due_on_idx ON work_items ((data->>'firstDueOn'));
CREATE INDEX IF NOT EXISTS work_items_op_type_idx ON work_items ((data->>'opType'));
CREATE INDEX IF NOT EXISTS work_items_module_idx ON work_items ((data->>'module'));
CREATE INDEX IF NOT EXISTS work_items_search_trgm_idx
  ON work_items USING gin ((id || ' ' || COALESCE(data->>'title', '') || ' ' || COALESCE(data->>'module', '')) gin_trgm_ops);

-- 3. ticket_disputes indexes
CREATE INDEX IF NOT EXISTS ticket_disputes_ticket_idx ON ticket_disputes (ticket_id);
CREATE INDEX IF NOT EXISTS ticket_disputes_requester_idx ON ticket_disputes (requester_id);
CREATE INDEX IF NOT EXISTS ticket_disputes_status_created_idx ON ticket_disputes (status, created_at DESC);

-- 4. ticket_allocations indexes & PG16 NULLS NOT DISTINCT uniqueness
CREATE INDEX IF NOT EXISTS ticket_allocations_ticket_idx ON ticket_allocations (ticket_id);
CREATE INDEX IF NOT EXISTS ticket_allocations_user_idx ON ticket_allocations (user_id);

DELETE FROM ticket_allocations a
USING ticket_allocations b
WHERE a.ctid < b.ctid
  AND a.ticket_id = b.ticket_id
  AND a.user_id = b.user_id
  AND a.sub_role IS NOT DISTINCT FROM b.sub_role;

ALTER TABLE ticket_allocations DROP CONSTRAINT IF EXISTS ticket_allocations_ticket_id_user_id_sub_role_key;
CREATE UNIQUE INDEX IF NOT EXISTS ticket_allocations_uq_not_distinct
  ON ticket_allocations (ticket_id, user_id, sub_role) NULLS NOT DISTINCT;

-- 5. ticket_stage_logs, ticket_due_shifts, sessions, people, employee_leaves
CREATE INDEX IF NOT EXISTS ticket_stage_logs_open_idx ON ticket_stage_logs (ticket_id) WHERE exited_at IS NULL;
CREATE INDEX IF NOT EXISTS ticket_stage_logs_entered_idx ON ticket_stage_logs (entered_at DESC);

DO $$ BEGIN
  IF to_regclass('public.ticket_due_shifts') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS ticket_due_shifts_ticket_status_idx ON ticket_due_shifts (ticket_id, status, approved_at DESC)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sessions_person_idx ON sessions (person_id);
CREATE INDEX IF NOT EXISTS people_team_active_idx ON people (team_id, active);
CREATE INDEX IF NOT EXISTS employee_leaves_date_idx ON employee_leaves (leave_date);

-- 6. Safe sequences for local ticket IDs & dispute codes
CREATE SEQUENCE IF NOT EXISTS local_ticket_seq;
SELECT setval(
  'local_ticket_seq',
  GREATEST(COALESCE((SELECT MAX(substring(id FROM 3)::integer) FROM work_items WHERE id ~ '^T-[0-9]+$'), 0), 1),
  (SELECT EXISTS(SELECT 1 FROM work_items WHERE id ~ '^T-[0-9]+$'))
);

CREATE SEQUENCE IF NOT EXISTS dispute_code_seq;
SELECT setval(
  'dispute_code_seq',
  GREATEST(COALESCE((SELECT COUNT(*)::integer FROM ticket_disputes), 0), 1),
  (SELECT EXISTS(SELECT 1 FROM ticket_disputes))
);

-- 7. Visibility scoping integrity: clean orphans and enforce cascading FKs
DELETE FROM team_visibility_rules
WHERE source_team_id NOT IN (SELECT id FROM teams)
   OR target_team_id NOT IN (SELECT id FROM teams);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_visibility_rules_source_fk') THEN
    ALTER TABLE team_visibility_rules
      ADD CONSTRAINT team_visibility_rules_source_fk
      FOREIGN KEY (source_team_id) REFERENCES teams(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_visibility_rules_target_fk') THEN
    ALTER TABLE team_visibility_rules
      ADD CONSTRAINT team_visibility_rules_target_fk
      FOREIGN KEY (target_team_id) REFERENCES teams(id) ON DELETE CASCADE;
  END IF;
END $$;

DELETE FROM user_allowed_teams
WHERE user_id NOT IN (SELECT id FROM people)
   OR allowed_team_id NOT IN (SELECT id FROM teams);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_allowed_teams_user_fk') THEN
    ALTER TABLE user_allowed_teams
      ADD CONSTRAINT user_allowed_teams_user_fk
      FOREIGN KEY (user_id) REFERENCES people(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_allowed_teams_team_fk') THEN
    ALTER TABLE user_allowed_teams
      ADD CONSTRAINT user_allowed_teams_team_fk
      FOREIGN KEY (allowed_team_id) REFERENCES teams(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Enterprise Multi-Team Expansion (v2.0) Schema
-- 1. Types & Enums
DO $$ BEGIN
    CREATE TYPE track_type AS ENUM ('RND', 'IMP', 'QA', 'UXBA', 'SUP', 'INFRA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE dispute_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Track Configs & Dynamic SLA Thresholds
CREATE TABLE IF NOT EXISTS track_configs (
    track_code text PRIMARY KEY,
    track_name text NOT NULL,
    target_index numeric(5,2) NOT NULL DEFAULT 75.00,
    formula_weights jsonb NOT NULL,
    sla_thresholds jsonb NOT NULL,
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Employee Leaves & Capacity
CREATE TABLE IF NOT EXISTS employee_leaves (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    leave_date date NOT NULL,
    leave_type text NOT NULL DEFAULT 'VACATION',
    deduct_md numeric(3,2) NOT NULL DEFAULT 1.00,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, leave_date)
);

-- 4. Ticket Multi-Role Allocations
CREATE TABLE IF NOT EXISTS ticket_allocations (
    id text PRIMARY KEY,
    ticket_id text NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    role_track text NOT NULL,
    sub_role text,
    estimated_md numeric(5,2) NOT NULL CHECK (estimated_md >= 0),
    actual_md numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (actual_md >= 0),
    allocated_due_on date,
    completed_at timestamptz,
    individual_score numeric(5,2),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(ticket_id, user_id, sub_role)
);

-- 5. Ticket Stage Cycle Time & Blocker Logs
CREATE TABLE IF NOT EXISTS ticket_stage_logs (
    id text PRIMARY KEY,
    ticket_id text NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    from_status text,
    to_status text NOT NULL,
    changed_by text REFERENCES people(id),
    blocking_team text,
    blocker_flag text DEFAULT 'NONE',
    entered_at timestamptz NOT NULL DEFAULT now(),
    exited_at timestamptz,
    duration_hours numeric(7,2)
);
CREATE INDEX IF NOT EXISTS idx_stage_logs_ticket ON ticket_stage_logs(ticket_id);

-- 6. Ticket Disputes & Exceptions
CREATE TABLE IF NOT EXISTS ticket_disputes (
    id text PRIMARY KEY,
    dispute_code text UNIQUE NOT NULL,
    ticket_id text NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    requester_id text NOT NULL REFERENCES people(id),
    requested_flag text NOT NULL,
    requested_reopen_override integer,
    reason text NOT NULL,
    evidence_url text,
    score_before numeric(5,2) NOT NULL,
    score_projected numeric(5,2) NOT NULL,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewer_id text REFERENCES people(id),
    reviewer_comment text,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Migration 005: Ticket Due Shifts (Approved Due Date Rescheduling)

CREATE TABLE IF NOT EXISTS ticket_due_shifts (
    id text PRIMARY KEY,
    ticket_id text NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    previous_first_due_on date NOT NULL,
    new_first_due_on date NOT NULL,
    shift_days numeric(5,2) NOT NULL,
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by text REFERENCES people(id),
    approved_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_due_shifts_ticket ON ticket_due_shifts(ticket_id);

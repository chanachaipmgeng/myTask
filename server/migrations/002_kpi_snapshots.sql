-- Frozen PersonScore rows per calendar month / quarter.

CREATE TABLE kpi_snapshots (
  id           bigserial PRIMARY KEY,
  period_type  text NOT NULL CHECK (period_type IN ('month', 'quarter')),
  period_key   text NOT NULL,
  person_id    text NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  track        text NOT NULL,
  nickname     text NOT NULL,
  score        jsonb NOT NULL,
  captured_at  timestamptz NOT NULL DEFAULT now(),
  captured_by  text,
  UNIQUE (period_type, period_key, person_id)
);

CREATE INDEX kpi_snapshots_period_idx ON kpi_snapshots (period_type, period_key);

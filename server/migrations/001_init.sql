-- Phase 0 + 1 schema. Ticket bodies are stored as jsonb in the shared Ticket shape
-- so the scoring code in shared/ can read them unchanged.

CREATE TABLE departments (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id             text PRIMARY KEY,
  department_id  text NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  name           text NOT NULL,
  lead_id        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE people (
  id                   text PRIMARY KEY,
  nickname             text NOT NULL,
  full_name            text NOT NULL DEFAULT '',
  role_title           text NOT NULL DEFAULT '',
  level                text NOT NULL CHECK (level IN ('Senior', 'Mid', 'Junior', 'FirstMonth')),
  track                text NOT NULL CHECK (track IN ('Implement', 'RD')),
  planned_md           numeric(6, 2) NOT NULL DEFAULT 0,
  team_id              text REFERENCES teams(id) ON DELETE SET NULL,
  access               text NOT NULL DEFAULT 'member' CHECK (access IN ('admin', 'lead', 'member')),
  email                text,
  gitlab_username      text,
  openproject_user_id  integer,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX people_gitlab_username_uq ON people (lower(gitlab_username)) WHERE gitlab_username IS NOT NULL;
CREATE UNIQUE INDEX people_op_user_uq ON people (openproject_user_id) WHERE openproject_user_id IS NOT NULL;

ALTER TABLE teams ADD CONSTRAINT teams_lead_fk FOREIGN KEY (lead_id) REFERENCES people(id) ON DELETE SET NULL;

CREATE TABLE work_items (
  id           text PRIMARY KEY,
  source       text NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'openproject')),
  op_id        integer UNIQUE,
  assignee_id  text NOT NULL DEFAULT '',
  closed       boolean NOT NULL DEFAULT false,
  closed_on    date,
  data         jsonb NOT NULL,
  synced_at    timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_items_assignee_idx ON work_items (assignee_id);
CREATE INDEX work_items_closed_on_idx ON work_items (closed_on);

CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Connection secrets are encrypted with TOKEN_ENC_KEY (AES-256-GCM).
CREATE TABLE connections (
  id          text PRIMARY KEY CHECK (id IN ('openproject', 'gitlab', 'teams')),
  base_url    text NOT NULL DEFAULT '',
  token_enc   text,
  enabled     boolean NOT NULL DEFAULT false,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_runs (
  id           bigserial PRIMARY KEY,
  connection   text NOT NULL,
  trigger      text NOT NULL CHECK (trigger IN ('manual', 'schedule')),
  started_by   text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  added        integer NOT NULL DEFAULT 0,
  updated      integer NOT NULL DEFAULT 0,
  unchanged    integer NOT NULL DEFAULT 0,
  errors       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- updatedAt lower bound used for this run. Null = full sync.
  since        timestamptz
);
CREATE INDEX sync_runs_conn_idx ON sync_runs (connection, started_at DESC);

CREATE TABLE op_users_seen (
  op_user_id  integer PRIMARY KEY,
  name        text NOT NULL DEFAULT '',
  login       text,
  email       text,
  last_seen   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id_hash     text PRIMARY KEY,
  person_id   text NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    text,
  action      text NOT NULL,
  target      text,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb
);

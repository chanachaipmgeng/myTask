CREATE TABLE IF NOT EXISTS git_branches (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL,
  project_name TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  author_username TEXT,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  ticket_id TEXT,
  web_url TEXT,
  last_commit_sha TEXT,
  last_commit_title TEXT,
  last_commit_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, branch_name)
);

CREATE INDEX IF NOT EXISTS git_branches_person_idx ON git_branches(person_id);
CREATE INDEX IF NOT EXISTS git_branches_ticket_idx ON git_branches(ticket_id);
CREATE INDEX IF NOT EXISTS git_branches_status_idx ON git_branches(status);

CREATE TABLE IF NOT EXISTS team_git_mappings (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  gitlab_project_id INT NOT NULL,
  gitlab_project_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(team_id, gitlab_project_id)
);

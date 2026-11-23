-- Migration 009: Team-Based Visibility Scoping (เมทริกซ์การแชร์ทีมและสิทธิ์มองเห็นข้ามทีม)

CREATE TABLE IF NOT EXISTS team_visibility_rules (
  source_team_id text NOT NULL,
  target_team_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_team_id, target_team_id)
);

CREATE TABLE IF NOT EXISTS user_allowed_teams (
  user_id text NOT NULL,
  allowed_team_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, allowed_team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_visibility_rules_source ON team_visibility_rules(source_team_id);
CREATE INDEX IF NOT EXISTS idx_user_allowed_teams_user ON user_allowed_teams(user_id);

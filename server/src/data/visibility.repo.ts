import { Queryable } from '../db/db.service';
import { TeamVisibilityRule, VisibilityConfig } from '../../../shared/domain/team-visibility';

export async function getVisibilityConfig(db: Queryable): Promise<VisibilityConfig> {
  const [matrixRows, userRows] = await Promise.all([
    db.query<{ source_team_id: string; target_team_id: string }>(
      'SELECT source_team_id, target_team_id FROM team_visibility_rules ORDER BY source_team_id, target_team_id',
    ),
    db.query<{ user_id: string; allowed_team_id: string }>(
      'SELECT user_id, allowed_team_id FROM user_allowed_teams ORDER BY user_id, allowed_team_id',
    ),
  ]);

  const matrix: TeamVisibilityRule[] = matrixRows.map((r) => ({
    sourceTeamId: r.source_team_id,
    targetTeamId: r.target_team_id,
  }));

  const userOverrides: Record<string, string[]> = {};
  for (const r of userRows) {
    if (!userOverrides[r.user_id]) {
      userOverrides[r.user_id] = [];
    }
    userOverrides[r.user_id].push(r.allowed_team_id);
  }

  return { matrix, userOverrides };
}

export async function setUserAllowedTeams(
  db: Queryable,
  userId: string,
  allowedTeams: string[],
): Promise<string[]> {
  await db.query('DELETE FROM user_allowed_teams WHERE user_id = $1', [userId]);
  const cleanTeams = Array.from(new Set(allowedTeams.map((t) => t.trim()).filter(Boolean)));
  for (const teamId of cleanTeams) {
    await db.query(
      'INSERT INTO user_allowed_teams (user_id, allowed_team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, teamId],
    );
  }
  return cleanTeams;
}

export async function setTeamVisibilityMatrix(
  db: Queryable,
  matrix: TeamVisibilityRule[],
): Promise<TeamVisibilityRule[]> {
  await db.query('DELETE FROM team_visibility_rules');
  const seen = new Set<string>();
  const cleanRules: TeamVisibilityRule[] = [];

  for (const rule of matrix) {
    const key = `${rule.sourceTeamId}:${rule.targetTeamId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleanRules.push(rule);
    await db.query(
      'INSERT INTO team_visibility_rules (source_team_id, target_team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [rule.sourceTeamId, rule.targetTeamId],
    );
  }
  return cleanRules;
}

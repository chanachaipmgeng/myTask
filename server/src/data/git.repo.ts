import { GitBranchItem, PersonGitSummary, TeamGitMapping } from '../../../shared/domain/git-branch';
import { Db, Queryable } from '../db/db.service';

export interface GitBranchRow {
  id: number;
  project_id: number;
  project_name: string;
  branch_name: string;
  author_username: string | null;
  person_id: string | null;
  person_name?: string | null;
  ticket_id: string | null;
  ticket_title?: string | null;
  web_url: string | null;
  last_commit_sha: string | null;
  last_commit_title: string | null;
  last_commit_at: Date | string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export async function listGitBranches(
  db: Queryable,
  filters?: {
    personId?: string;
    teamId?: string;
    unmatchedOnly?: boolean;
    status?: string;
  },
): Promise<GitBranchItem[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.personId) {
    params.push(filters.personId);
    conditions.push(`b.person_id = $${params.length}`);
  }

  if (filters?.status) {
    params.push(filters.status);
    conditions.push(`b.status = $${params.length}`);
  }

  if (filters?.unmatchedOnly) {
    conditions.push(`(b.ticket_id IS NULL OR b.ticket_id = '')`);
  }

  if (filters?.teamId) {
    params.push(filters.teamId);
    conditions.push(
      `b.project_id IN (SELECT gitlab_project_id FROM team_git_mappings WHERE team_id = $${params.length})`,
    );
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      b.*,
      p.nickname AS person_name,
      w.data->>'title' AS ticket_title
    FROM git_branches b
    LEFT JOIN people p ON p.id = b.person_id
    LEFT JOIN work_items w ON w.id = b.ticket_id OR (w.op_id IS NOT NULL AND w.op_id::text = b.ticket_id)
    ${whereSql}
    ORDER BY b.updated_at DESC
  `;

  const rows = await db.query<GitBranchRow>(sql, params);

  return rows.map((r) => ({
    id: Number(r.id),
    projectId: Number(r.project_id),
    projectName: r.project_name,
    branchName: r.branch_name,
    authorUsername: r.author_username,
    personId: r.person_id,
    personName: r.person_name ?? r.author_username,
    ticketId: r.ticket_id,
    ticketTitle: r.ticket_title ?? null,
    webUrl: r.web_url,
    lastCommitSha: r.last_commit_sha,
    lastCommitTitle: r.last_commit_title,
    lastCommitAt: r.last_commit_at instanceof Date ? r.last_commit_at.toISOString() : (r.last_commit_at ? String(r.last_commit_at) : null),
    status: (r.status as 'active' | 'merged' | 'closed') || 'active',
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }));
}

export async function upsertGitBranch(
  db: Queryable,
  branch: {
    projectId: number;
    projectName: string;
    branchName: string;
    authorUsername?: string | null;
    personId?: string | null;
    ticketId?: string | null;
    webUrl?: string | null;
    lastCommitSha?: string | null;
    lastCommitTitle?: string | null;
    lastCommitAt?: string | Date | null;
    status?: string;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO git_branches (
      project_id, project_name, branch_name, author_username,
      person_id, ticket_id, web_url, last_commit_sha,
      last_commit_title, last_commit_at, status, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
    ON CONFLICT (project_id, branch_name) DO UPDATE SET
      author_username = COALESCE(EXCLUDED.author_username, git_branches.author_username),
      person_id = COALESCE(EXCLUDED.person_id, git_branches.person_id),
      ticket_id = COALESCE(EXCLUDED.ticket_id, git_branches.ticket_id),
      web_url = COALESCE(EXCLUDED.web_url, git_branches.web_url),
      last_commit_sha = COALESCE(EXCLUDED.last_commit_sha, git_branches.last_commit_sha),
      last_commit_title = COALESCE(EXCLUDED.last_commit_title, git_branches.last_commit_title),
      last_commit_at = COALESCE(EXCLUDED.last_commit_at, git_branches.last_commit_at),
      status = COALESCE(EXCLUDED.status, git_branches.status),
      updated_at = now()`,
    [
      branch.projectId,
      branch.projectName,
      branch.branchName,
      branch.authorUsername ?? null,
      branch.personId ?? null,
      branch.ticketId ?? null,
      branch.webUrl ?? null,
      branch.lastCommitSha ?? null,
      branch.lastCommitTitle ?? null,
      branch.lastCommitAt ?? null,
      branch.status ?? 'active',
    ],
  );
}

export async function linkGitBranchToTicket(
  db: Queryable,
  branchId: number,
  ticketId: string,
): Promise<void> {
  await db.query(
    `UPDATE git_branches 
     SET ticket_id = $1, updated_at = now() 
     WHERE id = $2`,
    [ticketId, branchId],
  );
}

export async function getPersonGitSummary(
  db: Queryable,
  personId: string,
): Promise<PersonGitSummary> {
  const branches = await listGitBranches(db, { personId });
  const active = branches.filter((b) => b.status === 'active');
  const unmatched = active.filter((b) => !b.ticketId);

  return {
    personId,
    activeBranchesCount: active.length,
    unmatchedBranchesCount: unmatched.length,
    openMrsCount: 0, // Will be supplemented by GitLab MR sync
    recentBranches: branches.slice(0, 10),
  };
}

export async function listTeamGitMappings(db: Queryable): Promise<TeamGitMapping[]> {
  const rows = await db.query<{
    team_id: string;
    gitlab_project_id: number;
    gitlab_project_name: string;
  }>('SELECT team_id, gitlab_project_id, gitlab_project_name FROM team_git_mappings ORDER BY team_id');

  return rows.map((r) => ({
    teamId: r.team_id,
    gitlabProjectId: Number(r.gitlab_project_id),
    gitlabProjectName: r.gitlab_project_name,
  }));
}

export async function setTeamGitMappings(
  db: Queryable,
  teamId: string,
  projects: { id: number; name: string }[],
): Promise<void> {
  await db.query('DELETE FROM team_git_mappings WHERE team_id = $1', [teamId]);
  for (const p of projects) {
    await db.query(
      `INSERT INTO team_git_mappings (team_id, gitlab_project_id, gitlab_project_name)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [teamId, p.id, p.name],
    );
  }
}

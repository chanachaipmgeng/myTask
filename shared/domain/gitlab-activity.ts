import { extractTicketIdFromText } from './gitlab-mr';
import { parseTicketIdFromBranch } from './git-branch';

/** Normalized kinds for Person WS / drawer activity feed. */
export type GitActivityKind =
  | 'pushed'
  | 'pushed_tag'
  | 'deleted_branch'
  | 'opened_mr'
  | 'accepted_mr'
  | 'closed_mr'
  | 'commented'
  | 'other';

/** Raw-ish GitLab Events API shape (subset used for mapping). */
export interface GitLabActivityEventRaw {
  id?: number;
  action_name?: string | null;
  target_type?: string | null;
  target_title?: string | null;
  target_iid?: number | null;
  created_at?: string | null;
  push_data?: {
    commit_count?: number;
    action?: string;
    ref_type?: string;
    ref?: string;
    commit_title?: string;
    commit_from?: string;
    commit_to?: string;
  } | null;
  project?: {
    id?: number;
    name?: string;
    path_with_namespace?: string;
    web_url?: string;
  } | null;
  author?: { id?: number; username?: string; name?: string } | null;
  note?: { body?: string } | null;
}

export interface GitActivityRow {
  id: string;
  kind: GitActivityKind;
  createdAt: string;
  projectName: string;
  projectPath: string;
  projectWebUrl: string;
  /** Branch, tag, or MR title */
  targetLabel: string;
  /** e.g. commit title or MR title */
  detail: string;
  commitCount: number;
  mrIid: number | null;
  ticketId: string;
  /** Absolute or relative GitLab URL when known */
  webUrl: string;
  authorUsername: string;
}

export interface ContributionDay {
  date: string;
  count: number;
}

const KIND_LABEL_TH: Record<GitActivityKind, string> = {
  pushed: 'Push ไปยัง branch',
  pushed_tag: 'Push แท็ก',
  deleted_branch: 'ลบ branch',
  opened_mr: 'เปิด Merge Request',
  accepted_mr: 'Accept Merge Request',
  closed_mr: 'ปิด Merge Request',
  commented: 'คอมเมนต์',
  other: 'กิจกรรม',
};

export function gitActivityKindLabel(kind: GitActivityKind): string {
  return KIND_LABEL_TH[kind] ?? KIND_LABEL_TH.other;
}

export function resolveTicketIdFromGitText(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const scored = extractTicketIdFromText(part);
    if (scored) {
      // Branch names like OP-72417-ess → open drawer with OP-72417 (opId)
      const opOnly = /^OP-(\d+)/i.exec(scored);
      if (opOnly?.[1]) return `OP-${opOnly[1]}`;
      return scored;
    }
  }
  for (const part of parts) {
    const numeric = parseTicketIdFromBranch(part ?? '');
    if (numeric) return `OP-${numeric}`;
  }
  return '';
}

export function mapGitLabActivityKind(raw: GitLabActivityEventRaw): GitActivityKind {
  const action = (raw.action_name ?? '').trim().toLowerCase();
  const targetType = (raw.target_type ?? '').trim().toLowerCase();
  const refType = (raw.push_data?.ref_type ?? '').trim().toLowerCase();
  const pushAction = (raw.push_data?.action ?? '').trim().toLowerCase();

  if (action.includes('deleted') || pushAction === 'removed') {
    return 'deleted_branch';
  }
  if (action.includes('pushed') || pushAction === 'pushed' || pushAction === 'created') {
    if (refType === 'tag') return 'pushed_tag';
    return 'pushed';
  }
  if (targetType === 'mergerequest' || targetType === 'merge_request') {
    if (action.includes('accepted') || action.includes('approved') || action === 'merged') {
      return 'accepted_mr';
    }
    if (action.includes('opened') || action === 'opened') return 'opened_mr';
    if (action.includes('closed')) return 'closed_mr';
    if (action.includes('commented')) return 'commented';
  }
  if (action.includes('commented')) return 'commented';
  return 'other';
}

export function mapGitLabActivityEvent(raw: GitLabActivityEventRaw): GitActivityRow | null {
  const createdAt = (raw.created_at ?? '').trim();
  if (!createdAt) return null;

  const kind = mapGitLabActivityKind(raw);
  const ref = (raw.push_data?.ref ?? '').trim();
  const targetTitle = (raw.target_title ?? '').trim();
  const commitTitle = (raw.push_data?.commit_title ?? '').trim();
  const noteBody = (raw.note?.body ?? '').trim();
  const projectName = (raw.project?.name ?? '').trim() || 'โปรเจกต์';
  const projectPath = (raw.project?.path_with_namespace ?? '').trim();
  const projectWebUrl = (raw.project?.web_url ?? '').trim();
  const mrIid = typeof raw.target_iid === 'number' ? raw.target_iid : null;

  const targetLabel =
    kind === 'opened_mr' || kind === 'accepted_mr' || kind === 'closed_mr' || kind === 'commented'
      ? targetTitle || (mrIid != null ? `!${mrIid}` : 'Merge Request')
      : ref || targetTitle || '—';

  const detail = commitTitle || targetTitle || noteBody.slice(0, 160) || gitActivityKindLabel(kind);

  const ticketId = resolveTicketIdFromGitText(targetTitle, ref, commitTitle, noteBody, projectPath);

  let webUrl = '';
  if (projectWebUrl && mrIid != null && (kind === 'opened_mr' || kind === 'accepted_mr' || kind === 'closed_mr' || kind === 'commented')) {
    webUrl = `${projectWebUrl.replace(/\/+$/, '')}/-/merge_requests/${mrIid}`;
  } else if (projectWebUrl && ref && (kind === 'pushed' || kind === 'pushed_tag' || kind === 'deleted_branch')) {
    const encoded = encodeURIComponent(ref);
    webUrl =
      kind === 'pushed_tag'
        ? `${projectWebUrl.replace(/\/+$/, '')}/-/tags/${encoded}`
        : `${projectWebUrl.replace(/\/+$/, '')}/-/tree/${encoded}`;
  } else if (projectWebUrl) {
    webUrl = projectWebUrl;
  }

  const id =
    raw.id != null
      ? `ev-${raw.id}`
      : `ev-${createdAt}-${kind}-${ref || mrIid || targetTitle}`.slice(0, 120);

  return {
    id,
    kind,
    createdAt,
    projectName,
    projectPath,
    projectWebUrl,
    targetLabel,
    detail,
    commitCount: typeof raw.push_data?.commit_count === 'number' ? raw.push_data.commit_count : 0,
    mrIid,
    ticketId,
    webUrl,
    authorUsername: (raw.author?.username ?? '').trim().toLowerCase(),
  };
}

export function mapGitLabActivityEvents(raws: readonly GitLabActivityEventRaw[]): GitActivityRow[] {
  const rows: GitActivityRow[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const row = mapGitLabActivityEvent(raw);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows;
}

/** Keep events that mention the scorecard ticket id or OP-{opId}. */
export function filterGitActivityForTicket(
  rows: readonly GitActivityRow[],
  ticketId: string,
  opId?: number | null,
): GitActivityRow[] {
  const id = (ticketId ?? '').trim().toUpperCase();
  const opKey = typeof opId === 'number' && opId > 0 ? `OP-${opId}` : '';
  if (!id && !opKey) return [];
  return rows.filter((row) => {
    const tid = (row.ticketId ?? '').toUpperCase();
    if (!tid) {
      const hay = `${row.targetLabel} ${row.detail}`.toUpperCase();
      if (id && hay.includes(id)) return true;
      if (opKey && hay.includes(opKey)) return true;
      if (opId != null && hay.includes(String(opId))) return true;
      return false;
    }
    if (id && tid === id) return true;
    if (opKey && tid === opKey) return true;
    if (opId != null && tid === String(opId)) return true;
    return false;
  });
}

/** Daily contribution counts for the last `days` calendar days (inclusive of today). */
export function buildContributionDays(
  rows: readonly GitActivityRow[],
  days = 365,
  todayIso?: string,
): ContributionDay[] {
  const today = (todayIso ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const end = new Date(`${today}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const counts = new Map<string, number>();
  for (const row of rows) {
    const d = (row.createdAt ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (d < start.toISOString().slice(0, 10) || d > today) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }

  const out: ContributionDay[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Intensity 0–4 for GitLab-like contribution cells. */
export function contributionLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

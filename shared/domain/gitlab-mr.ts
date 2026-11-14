export interface GitLabMergeRequestRaw {
  id?: number;
  iid?: number;
  sha?: string | null;
  merge_commit_sha?: string | null;
  title?: string | null;
  description?: string | null;
  source_branch?: string | null;
  merged_at?: string | null;
  web_url?: string | null;
  user_notes_count?: number | null;
  /** Optional explicit override when provided by custom labels or notes. */
  reviewRounds?: number | null;
  reopenCount?: number | null;
}

export interface MappedGitLabCommit {
  sha: string;
  message: string;
  mergedAt: string;
  ticketId: string;
  reviewRounds: number;
  reopenCount: number;
  mrLink?: string;
}

const TICKET_ID_PATTERN = /\b((?:OP|IMP|RD|FILE|ALERT|MOCK|Q|T)-[A-Z0-9-]+)\b/i;

/** Extracts a scorecard ticket ID (e.g. OP-42, IMP-ITS-CR, RD-SPIKE, T-001) from MR title/branch/description. */
export function extractTicketIdFromText(text: string | null | undefined): string {
  if (!text) {
    return '';
  }
  const match = TICKET_ID_PATTERN.exec(text);
  return match ? match[1]!.toUpperCase() : '';
}

/**
 * Converts GitLab API v4 Merge Request objects into the scorecard's MyGitCommit shape.
 * File counts or line counts are intentionally ignored per scoring rules.
 */
export function mapGitLabMergeRequests(items: readonly GitLabMergeRequestRaw[]): MappedGitLabCommit[] {
  const result: MappedGitLabCommit[] = [];
  const seen = new Set<string>();
  for (const mr of items) {
    const sha = (mr.merge_commit_sha || mr.sha || (mr.iid ? `mr-${mr.iid}` : '')).trim().slice(0, 12);
    if (!sha || seen.has(sha)) {
      continue;
    }
    seen.add(sha);
    const title = (mr.title ?? '').trim();
    const branch = (mr.source_branch ?? '').trim();
    const desc = (mr.description ?? '').trim();
    const ticketId =
      extractTicketIdFromText(title) ||
      extractTicketIdFromText(branch) ||
      extractTicketIdFromText(desc);
    const notes = typeof mr.user_notes_count === 'number' && mr.user_notes_count >= 0 ? mr.user_notes_count : 0;
    const reviewRounds =
      typeof mr.reviewRounds === 'number' && mr.reviewRounds >= 0
        ? Math.round(mr.reviewRounds)
        : notes === 0
          ? 1
          : Math.min(6, Math.max(1, Math.ceil(notes / 2)));
    const reopenCount =
      typeof mr.reopenCount === 'number' && mr.reopenCount >= 0 ? Math.round(mr.reopenCount) : 0;
    result.push({
      sha,
      message: title || branch || sha,
      mergedAt: (mr.merged_at ?? '').trim(),
      ticketId,
      reviewRounds,
      reopenCount,
      mrLink: mr.web_url?.trim() || undefined,
    });
  }
  return result;
}

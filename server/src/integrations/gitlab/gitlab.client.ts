import { GitLabMergeRequestRaw } from '../../../../shared/domain/gitlab-mr';

export interface GitLabProject {
  id: number;
  name?: string;
  path_with_namespace?: string;
  web_url?: string;
}

export interface GitLabCommit {
  id?: string;
  short_id?: string;
  title?: string;
  created_at?: string;
  committed_date?: string;
  author_name?: string;
}

export interface GitLabBranch {
  name: string;
  merged?: boolean;
  protected?: boolean;
  default?: boolean;
  web_url?: string;
  commit?: {
    id?: string;
    short_id?: string;
    title?: string;
    created_at?: string;
    author_name?: string;
    author_email?: string;
  };
}

export interface GitLabDiscussionNote {
  id?: number;
  type?: string | null;
  body?: string;
  resolvable?: boolean;
  resolved?: boolean;
  system?: boolean;
  author?: { id?: number; username?: string; name?: string };
  created_at?: string;
}

export interface GitLabDiscussion {
  id?: string;
  individual_note?: boolean;
  notes?: GitLabDiscussionNote[];
}

export interface GitLabPipeline {
  id?: number;
  iid?: number;
  status?: string;
  ref?: string;
  sha?: string;
  web_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GitLabUserEvent {
  id?: number;
  action_name?: string;
  target_type?: string | null;
  created_at?: string;
  push_data?: { commit_count?: number; ref?: string; commit_from?: string; commit_to?: string };
  author?: { id?: number; username?: string; name?: string };
}

export interface GitLabApprovals {
  approved_by?: { user?: { id?: number; username?: string; name?: string } }[];
  approvers?: { user?: { id?: number; username?: string; name?: string } }[];
  approvals_left?: number;
}

export interface MrCommitSpan {
  firstCommitOn: string | null;
  lastCommitOn: string | null;
  commitCount: number;
}

export interface MrDiscussionSummary {
  reviewRounds: number;
  unresolvedThreads: number;
  noteCount: number;
}

export type CiStatus = 'passed' | 'failed' | 'running' | 'canceled' | 'skipped' | 'unknown';

export class GitLabClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async listProjects(params?: { membership?: boolean; simple?: boolean; perPage?: number }): Promise<GitLabProject[]> {
    const query = new URLSearchParams({
      membership: String(params?.membership ?? true),
      simple: String(params?.simple ?? true),
      per_page: String(params?.perPage ?? 100),
    });
    return this.paginateAll<GitLabProject>(`/api/v4/projects?${query.toString()}`);
  }

  async listMergeRequests(
    projectId: string | number,
    params?: { state?: 'opened' | 'merged' | 'closed' | 'all'; perPage?: number },
  ): Promise<GitLabMergeRequestRaw[]> {
    const query = new URLSearchParams({
      state: params?.state ?? 'merged',
      per_page: String(params?.perPage ?? 100),
    });
    const encoded = encodeURIComponent(String(projectId));
    return this.paginateAll<GitLabMergeRequestRaw>(
      `/api/v4/projects/${encoded}/merge_requests?${query.toString()}`,
    );
  }

  async listBranches(
    projectId: string | number,
    params?: { search?: string; perPage?: number },
  ): Promise<GitLabBranch[]> {
    const query = new URLSearchParams({
      per_page: String(params?.perPage ?? 100),
    });
    if (params?.search) {
      query.set('search', params.search);
    }
    const encoded = encodeURIComponent(String(projectId));
    return this.paginateAll<GitLabBranch>(
      `/api/v4/projects/${encoded}/repository/branches?${query.toString()}`,
    );
  }

  /** Group-level open MRs across all projects the token can see. */
  async listOpenMergeRequests(params?: {
    reviewerUsername?: string;
    authorUsername?: string;
    perPage?: number;
  }): Promise<GitLabMergeRequestRaw[]> {
    const query = new URLSearchParams({
      state: 'opened',
      scope: 'all',
      per_page: String(params?.perPage ?? 100),
    });
    if (params?.reviewerUsername) {
      query.set('reviewer_username', params.reviewerUsername);
    }
    if (params?.authorUsername) {
      query.set('author_username', params.authorUsername);
    }
    return this.paginateAll<GitLabMergeRequestRaw>(`/api/v4/merge_requests?${query.toString()}`);
  }

  async getMrApprovals(projectId: string | number, iid: number): Promise<GitLabApprovals> {
    const encoded = encodeURIComponent(String(projectId));
    return this.get<GitLabApprovals>(`/api/v4/projects/${encoded}/merge_requests/${iid}/approvals`);
  }

  async getMrCommits(projectId: string | number, iid: number): Promise<GitLabCommit[]> {
    const encoded = encodeURIComponent(String(projectId));
    return this.paginateAll<GitLabCommit>(
      `/api/v4/projects/${encoded}/merge_requests/${iid}/commits?per_page=100`,
    );
  }

  async getMrDiscussions(projectId: string | number, iid: number): Promise<GitLabDiscussion[]> {
    const encoded = encodeURIComponent(String(projectId));
    return this.paginateAll<GitLabDiscussion>(
      `/api/v4/projects/${encoded}/merge_requests/${iid}/discussions?per_page=100`,
    );
  }

  async getMrPipelines(projectId: string | number, iid: number): Promise<GitLabPipeline[]> {
    const encoded = encodeURIComponent(String(projectId));
    return this.paginateAll<GitLabPipeline>(
      `/api/v4/projects/${encoded}/merge_requests/${iid}/pipelines?per_page=20`,
    );
  }

  async getUserEvents(
    userId: number | string,
    params?: { after?: string; before?: string; perPage?: number },
  ): Promise<GitLabUserEvent[]> {
    const query = new URLSearchParams({
      per_page: String(params?.perPage ?? 100),
    });
    if (params?.after) {
      query.set('after', params.after);
    }
    if (params?.before) {
      query.set('before', params.before);
    }
    return this.paginateAll<GitLabUserEvent>(`/api/v4/users/${userId}/events?${query.toString()}`);
  }

  static commitSpan(commits: readonly GitLabCommit[]): MrCommitSpan {
    const dates = commits
      .map((c) => (c.committed_date || c.created_at || '').slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    return {
      firstCommitOn: dates[0] ?? null,
      lastCommitOn: dates.length > 0 ? dates[dates.length - 1]! : null,
      commitCount: commits.length,
    };
  }

  static discussionSummary(discussions: readonly GitLabDiscussion[]): MrDiscussionSummary {
    let noteCount = 0;
    let unresolvedThreads = 0;
    let reviewNoteThreads = 0;
    for (const discussion of discussions) {
      const notes = discussion.notes ?? [];
      const humanNotes = notes.filter((n) => !n.system);
      noteCount += humanNotes.length;
      const hasResolvable = notes.some((n) => n.resolvable);
      if (hasResolvable) {
        reviewNoteThreads += 1;
        const stillOpen = notes.some((n) => n.resolvable && !n.resolved);
        if (stillOpen) {
          unresolvedThreads += 1;
        }
      } else if (humanNotes.length > 0 && !discussion.individual_note) {
        reviewNoteThreads += 1;
      }
    }
    const reviewRounds =
      reviewNoteThreads === 0 ? (noteCount === 0 ? 1 : Math.min(6, Math.max(1, Math.ceil(noteCount / 2)))) : Math.min(6, Math.max(1, reviewNoteThreads));
    return { reviewRounds, unresolvedThreads, noteCount };
  }

  static latestCiStatus(pipelines: readonly GitLabPipeline[]): CiStatus {
    const latest = pipelines[0];
    if (!latest?.status) {
      return 'unknown';
    }
    switch (latest.status) {
      case 'success':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'running':
      case 'pending':
      case 'created':
      case 'waiting_for_resource':
      case 'preparing':
        return 'running';
      case 'canceled':
      case 'cancelled':
        return 'canceled';
      case 'skipped':
      case 'manual':
        return 'skipped';
      default:
        return 'unknown';
    }
  }

  private async paginateAll<T>(pathWithQuery: string, maxPages = 50): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    for (let i = 0; i < maxPages; i += 1) {
      const sep = pathWithQuery.includes('?') ? '&' : '?';
      const path = `${pathWithQuery}${sep}page=${page}`;
      const { data, next } = await this.getPage<T[]>(path);
      if (Array.isArray(data)) {
        results.push(...data);
      }
      if (!next) {
        break;
      }
      const nextNum = Number(next);
      if (!Number.isFinite(nextNum) || nextNum < 1 || nextNum === page) {
        break;
      }
      page = nextNum;
    }
    return results;
  }

  private async get<T>(path: string): Promise<T> {
    const { data } = await this.getPage<T>(path);
    return data;
  }

  private async getPage<T>(
    path: string,
    attempt = 0,
  ): Promise<{ data: T; next: string | null }> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}${path}`;
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'PRIVATE-TOKEN': this.token,
      },
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      const wait = Math.min(8_000, 500 * 2 ** attempt);
      await sleep(wait);
      return this.getPage<T>(path, attempt + 1);
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitLab ${response.status} ${path}: ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as T;
    const next = response.headers.get('x-next-page')?.trim() || null;
    return { data, next: next && next.length > 0 ? next : null };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

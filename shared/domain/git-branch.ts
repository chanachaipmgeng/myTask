export interface GitBranchItem {
  id: number;
  projectId: number;
  projectName: string;
  branchName: string;
  authorUsername: string | null;
  personId: string | null;
  personName?: string | null;
  ticketId: string | null;
  ticketTitle?: string | null;
  webUrl: string | null;
  lastCommitSha: string | null;
  lastCommitTitle: string | null;
  lastCommitAt: string | null;
  status: 'active' | 'merged' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface TeamGitMapping {
  teamId: string;
  gitlabProjectId: number;
  gitlabProjectName: string;
}

export interface CreateTicketFromBranchPayload {
  branchId: number;
  branchName: string;
  projectId: string | number; // myProject (OpenProject) project ID or identifier
  subject: string;
  description?: string;
  typeId?: number;
  assigneePersonId?: string;
  estimateMd?: number;
}

export interface PersonGitSummary {
  personId: string;
  activeBranchesCount: number;
  unmatchedBranchesCount: number;
  openMrsCount: number;
  recentBranches: GitBranchItem[];
}

/**
 * Extracts a numeric ticket / work package ID from a branch name.
 * Handles patterns:
 * - feature/1234-tax-calc -> 1234
 * - feat/#1234-something -> 1234
 * - OP-1234-something -> 1234
 * - bugfix/ticket-9988 -> 9988
 * - 1234_payroll -> 1234
 */
export function parseTicketIdFromBranch(branchName: string): string | null {
  if (!branchName) return null;
  const trimmed = branchName.trim();

  // Pattern 1: OP-1234 or WP-1234
  const opMatch = trimmed.match(/(?:OP|WP)[-_](\d{1,7})/i);
  if (opMatch?.[1]) {
    return opMatch[1];
  }

  // Pattern 2: #1234 or ticket-1234
  const ticketMatch = trimmed.match(/(?:ticket|issue|#)[-_]?(\d{1,7})/i);
  if (ticketMatch?.[1]) {
    return ticketMatch[1];
  }

  // Pattern 3: Prefix/Digits (e.g. feat/1234-name, 1234-name, fix/1234)
  const prefixMatch = trimmed.match(/(?:^|\/|[_-])(\d{2,7})(?:$|[_-])/);
  if (prefixMatch?.[1]) {
    return prefixMatch[1];
  }

  return null;
}

export interface SuggestBranchNameInput {
  /** OpenProject work package id (numeric). */
  opId: number | string;
  title?: string | null;
  /** Ticket type / opType — drives feat|bug|spike prefix. */
  type?: string | null;
}

/**
 * Builds a Git branch name that round-trips through {@link parseTicketIdFromBranch}.
 * Example: `{ opId: 73306, title: 'Migrate Bootstrap 3.5 Security', type: 'Feature' }`
 * → `feat/OP-73306-migrate-bootstrap-3-5-security`
 */
export function suggestBranchNameFromTicket(input: SuggestBranchNameInput): string {
  const opId = String(input.opId ?? '').replace(/\D/g, '');
  if (!opId) {
    throw new Error('opId is required to suggest a branch name');
  }
  const prefix = branchPrefixFromType(input.type);
  const slug = slugifyTicketTitle(input.title ?? '');
  return slug ? `${prefix}/OP-${opId}-${slug}` : `${prefix}/OP-${opId}`;
}

function branchPrefixFromType(type: string | null | undefined): 'feat' | 'bug' | 'spike' {
  const raw = (type ?? '').trim().toLowerCase();
  if (!raw) return 'feat';
  if (/(bug|defect|hotfix|fix)/.test(raw)) return 'bug';
  if (/(spike|poc|research|r&d|rnd|ai)/.test(raw)) return 'spike';
  return 'feat';
}

/** Latin / digits / hyphens only · collapse · trim · max ~40 chars. */
export function slugifyTicketTitle(title: string, maxLen = 40): string {
  const ascii = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (!ascii) return '';
  if (ascii.length <= maxLen) return ascii;
  const cut = ascii.slice(0, maxLen).replace(/-+$/g, '');
  return cut || ascii.slice(0, maxLen);
}

/**
 * Converts a git branch name into a clean, human-readable ticket subject.
 * e.g. "feat/1234-payroll-tax-calc" -> "Payroll tax calc"
 * e.g. "bugfix/login-sso-failure" -> "Login sso failure"
 */
export function cleanBranchToTicketTitle(branchName: string): string {
  if (!branchName) return '';
  let str = branchName.trim();

  // Strip leading branch category (e.g. feature/, feat/, bugfix/, fix/, chore/, refactor/)
  str = str.replace(/^(?:feature|feat|bugfix|fix|hotfix|chore|refactor|docs|spike|test)\//i, '');

  // Strip ticket identifier (e.g. 1234-, #1234-, OP-1234-, ticket-1234-)
  str = str.replace(/^(?:OP[-_]|WP[-_]|ticket[-_]|issue[-_]|#)?\d{1,7}[-_]?/i, '');

  // Replace delimiters with spaces
  str = str.replace(/[-_./]+/g, ' ').trim();

  if (!str) {
    return branchName;
  }

  // Capitalize first letter
  return str.charAt(0).toUpperCase() + str.slice(1);
}

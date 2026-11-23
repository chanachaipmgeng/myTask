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

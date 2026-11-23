export type TrackCode = 'RND' | 'IMP' | 'QA' | 'UXBA' | 'SUP' | 'INFRA';

export type Track = 'Implement' | 'RD' | TrackCode;

export function normalizeTrack(track: Track | string | null | undefined): TrackCode {
  if (!track) return 'IMP';
  if (track === 'Implement' || track === 'IMP') return 'IMP';
  if (track === 'RD' || track === 'RND') return 'RND';
  if (track === 'QA') return 'QA';
  if (track === 'UXBA') return 'UXBA';
  if (track === 'SUP') return 'SUP';
  if (track === 'INFRA') return 'INFRA';
  return 'IMP';
}

export function trackDisplayLabel(track: Track | string | null | undefined): string {
  const code = normalizeTrack(track);
  switch (code) {
    case 'RND':
      return 'R&D (FE / BE / AI)';
    case 'IMP':
      return 'Implement';
    case 'QA':
      return 'QA / Tester';
    case 'UXBA':
      return 'Product / BA / UX';
    case 'SUP':
      return 'Support / Helpdesk';
    case 'INFRA':
      return 'Infra / DevOps / Sec';
  }
}

export type Level = 'Senior' | 'Mid' | 'Junior' | 'FirstMonth';

export type TicketType =
  | 'Feature'
  | 'CR'
  | 'Bug-Investigate'
  | 'Bug-Fix'
  | 'Spike'
  | 'Ops'
  | 'TechDebt';

export type Size = 'XS' | 'S' | 'M' | 'L' | 'XL';

export type VarianceCode = 'NONE' | 'REQ' | 'BLK' | 'ENV' | 'LEG';

export type WorkloadCategory =
  | 'Bug'
  | 'Customization'
  | 'Enhancement'
  | 'Request'
  | 'Spike'
  | 'TechDebt';

export type AccessRole = 'admin' | 'lead' | 'member';

export interface Department {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  departmentId: string;
  name: string;
  leadId: string | null;
}

export interface Person {
  id: string;
  nickname: string;
  fullName: string;
  role: string;
  level: Level;
  track: Track;
  /** Planned man-days for this scorecard window. Not the weekly quota. */
  plannedMd: number;
  /** Main team. Empty when the person is not placed in a team yet. */
  teamId?: string | null;
  access?: AccessRole;
  email?: string | null;
  gitlabUsername?: string | null;
  openprojectUserId?: number | null;
  avatarUrl?: string | null;
  department?: string | null;
  /** ฝ่ายย่อยจาก OpenProject customField2 */
  unit?: string | null;
  jobTitle?: string | null;
  active?: boolean;
  /** ทีมที่ผู้ใช้นี้ได้รับอนุญาตให้มองเห็น */
  allowedTeams?: string[];
}

export interface Ticket {
  id: string;
  track: Track;
  type: TicketType;
  module: string;
  size: Size;
  estimateMd: number;
  actualMd: number;
  /** 0 = committed week, 1 = slipped one week, 2 or more = slipped further. */
  weekOffset: number;
  reviewRounds: number;
  blocker: boolean;
  reopenCount: number;
  varianceCode: VarianceCode;
  closed: boolean;
  dodPassed: boolean;
  inTimeBox: boolean;
  childTicketsSized: boolean;
  unplanned: boolean;
  /** Empty when the ticket is still in the new-work queue. */
  assigneeId: string;
  closedOn: string | null;
  /** Working days left in the committed week. Null when that clock is unknown. */
  workingDaysLeft: number | null;
  note: string;
  /** Pipeline column. Missing values are derived from assignee and closed. */
  workflowStatus?: WorkflowStatus;
  discipline?: Discipline | '';
  workCategory?: WorkCategory | '';
  storyPoints?: StoryPoint | null;
  /** First promised delivery date. Locked once set. */
  firstDueOn?: string | null;
  mrLink?: string;
  pocResult?: PocResult | '';
  bugCause?: BugCause | '';
  /** Set by the system when the card enters In Progress. */
  actualStartOn?: string | null;
  /** Set by the system when the card enters Ready for QA. */
  devDeliveredOn?: string | null;
  /** Where the ticket came from. Missing means local / seed / file import. */
  source?: 'local' | 'openproject';
  /** OpenProject work package id when source is openproject. */
  opId?: number | null;
  opProject?: string;
  /** Parent ticket ID in the scorecard (e.g. OP-10 or RD-SPIKE) for Gantt hierarchy. */
  parentId?: string | null;
  /** Parent work package ID in OpenProject when source is openproject. */
  opParentId?: number | null;
  title?: string;
  dueOn?: string | null;
  /** Multi-role effort split flag */
  isSplitEffort?: boolean;
  allocations?: TicketAllocation[];
  reviewerId?: string | null;
  qaAssigneeId?: string | null;
  qaEstimatedMd?: number;
  /** First timestamp when moved to Ready for QA (used for fair developer on-time measurement) */
  readyForQaAt?: string | null;
  /** Defects that leaked to Production */
  isBugEscape?: boolean;
  /** Definition of Done evidence checklist */
  dodChecklist?: DodChecklist;
  /** Direct urgent mandate from the Managing Director */
  isMdDirect?: boolean;
  /** Whether this ticket is currently paused */
  isPaused?: boolean;
  /** Reason why the ticket was paused (e.g. 'Paused (By MD Mandate)') */
  pausedReason?: string | null;
  /** Original promised delivery date before auto-shift */
  originalFirstDueOn?: string | null;
  /** Timestamp when the ticket was paused */
  pausedAt?: string | null;
  /** Number of working days paused/compensated */
  pausedDays?: number;
  /** ID of the MD Mandate ticket that triggered this pause */
  pausedByTicketId?: string | null;
  /** Reviewer IDs and Approved-by IDs from GitLab MR approvals */
  reviewers?: string[];
  approvedBy?: string[];
  /** Total calculated Peer Review MD credit awarded to reviewers (10-15%) */
  peerReviewCreditMd?: number;
}

export interface DodChecklist {
  unitTest: boolean;
  mrLinked: boolean;
  stagingVerified: boolean;
}

export interface TicketAllocation {
  id: string;
  ticketId: string;
  userId: string;
  roleTrack: TrackCode;
  subRole?: string;
  estimatedMd: number;
  actualMd: number;
  allocatedDueOn?: string | null;
  completedAt?: string | null;
  individualScore?: number | null;
}

export interface TicketStageLog {
  id: string;
  ticketId: string;
  fromStatus: WorkflowStatus | null;
  toStatus: WorkflowStatus;
  changedBy?: string | null;
  blockingTeam?: TrackCode | null;
  blockerFlag?: VarianceCode | 'NONE';
  enteredAt: string;
  exitedAt?: string | null;
  durationHours?: number | null;
}

export interface TicketDueShift {
  id: string;
  ticketId: string;
  previousFirstDueOn: string;
  newFirstDueOn: string;
  shiftDays: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string | null;
  approvedAt: string;
  createdAt: string;
}

export interface EmployeeLeave {
  id: string;
  userId: string;
  leaveDate: string;
  leaveType: 'VACATION' | 'SICK' | 'PUBLIC_HOLIDAY';
  deductMd: number;
  reason?: string;
}

export type DisputeStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface TicketDispute {
  id: string;
  disputeCode: string;
  ticketId: string;
  requesterId: string;
  requestedFlag: VarianceCode;
  requestedReopenOverride?: number;
  reason: string;
  evidenceUrl?: string;
  scoreBefore: number;
  scoreProjected: number;
  status: DisputeStatus;
  reviewerId?: string | null;
  reviewerComment?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface TrackConfig {
  trackCode: TrackCode;
  trackName: string;
  targetIndex: number;
  formulaWeights: Record<string, number>;
  slaThresholds: Record<string, number>;
  updatedBy?: string | null;
  updatedAt: string;
}

export const WORKFLOW_STATUSES = [
  'Backlog',
  'In Progress',
  'Code Review',
  'Ready for QA',
  'In QA',
  'Reopened',
  'Done',
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const DISCIPLINES = ['FE', 'BE', 'Full-Stack', 'AI-Data', 'Infra'] as const;

export type Discipline = (typeof DISCIPLINES)[number];

export const WORK_CATEGORIES = ['Feature', 'R&D-PoC', 'Refactor', 'BugInternal', 'BugProduction'] as const;

export type WorkCategory = (typeof WORK_CATEGORIES)[number];

export const STORY_POINTS = [1, 2, 3, 5, 8, 13] as const;

export type StoryPoint = (typeof STORY_POINTS)[number];

export const POC_RESULTS = ['Adopted', 'Alternative Chosen', 'Dropped'] as const;

export type PocResult = (typeof POC_RESULTS)[number];

export const BUG_CAUSES = ['Logic', 'UI', 'API', 'Requirement', 'Environment'] as const;

export type BugCause = (typeof BUG_CAUSES)[number];

export interface ChartPoint {
  x: string;
  y: number;
  text: string;
}

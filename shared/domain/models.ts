export type Track = 'Implement' | 'RD';

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
  title?: string;
  dueOn?: string | null;
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

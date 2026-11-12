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

export interface Person {
  id: string;
  nickname: string;
  fullName: string;
  role: string;
  level: Level;
  track: Track;
  /** Planned man-days for this scorecard window. Not the weekly quota. */
  plannedMd: number;
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
}

export interface ChartPoint {
  x: string;
  y: number;
  text: string;
}

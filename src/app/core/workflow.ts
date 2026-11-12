import {
  BUG_CAUSES,
  BugCause,
  DISCIPLINES,
  Discipline,
  POC_RESULTS,
  PocResult,
  STORY_POINTS,
  StoryPoint,
  Ticket,
  TicketType,
  WORK_CATEGORIES,
  WORKFLOW_STATUSES,
  WorkCategory,
  WorkflowStatus,
} from './models';

const RANK: Record<WorkflowStatus, number> = {
  Backlog: 0,
  Reopened: 1,
  'In Progress': 1,
  'Code Review': 2,
  'Ready for QA': 3,
  'In QA': 4,
  Done: 5,
};

const STORY_BY_SIZE = {
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8,
} as const;

const CATEGORY_BY_TYPE: Record<TicketType, WorkCategory> = {
  Feature: 'Feature',
  CR: 'Feature',
  'Bug-Investigate': 'BugInternal',
  'Bug-Fix': 'BugInternal',
  Spike: 'R&D-PoC',
  Ops: 'Feature',
  TechDebt: 'Refactor',
};

export const CATEGORY_LABELS: Record<WorkCategory, string> = {
  Feature: 'Feature',
  'R&D-PoC': 'R&D / PoC',
  Refactor: 'Refactor',
  BugInternal: 'Bug ภายใน',
  BugProduction: 'Bug production',
};

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  FE: 'FE',
  BE: 'BE',
  'Full-Stack': 'Full-Stack',
  'AI-Data': 'AI / Data',
  Infra: 'Infra',
};

export interface WorkflowFields {
  discipline: Discipline | '';
  workCategory: WorkCategory | '';
  storyPoints: StoryPoint | null;
  firstDueOn: string | null;
  mrLink: string;
  pocResult: PocResult | '';
  bugCause: BugCause | '';
}

export interface VelocityRow {
  personId: string;
  name: string;
  points: number;
}

export interface CategoryShare {
  key: WorkCategory;
  label: string;
  points: number;
  pct: number;
}

export interface PipelineReport {
  velocity: VelocityRow[];
  onTimePct: number;
  onTimeHit: number;
  onTimeTotal: number;
  firstTimePct: number;
  firstTimeHit: number;
  firstTimeTotal: number;
  categories: CategoryShare[];
}

export type MoveResult = { ok: true; ticket: Ticket } | { ok: false; message: string };

export function isWorkflowStatus(value: string): value is WorkflowStatus {
  return (WORKFLOW_STATUSES as readonly string[]).includes(value);
}

export function isStoryPoint(value: number | null | undefined): value is StoryPoint {
  return value != null && (STORY_POINTS as readonly number[]).includes(value);
}

export function isDiscipline(value: string): value is Discipline {
  return (DISCIPLINES as readonly string[]).includes(value);
}

export function isWorkCategory(value: string): value is WorkCategory {
  return (WORK_CATEGORIES as readonly string[]).includes(value);
}

export function isPocResult(value: string): value is PocResult {
  return (POC_RESULTS as readonly string[]).includes(value);
}

export function isBugCause(value: string): value is BugCause {
  return (BUG_CAUSES as readonly string[]).includes(value);
}

export function isBugCategory(category: string | undefined): boolean {
  return category === 'BugInternal' || category === 'BugProduction';
}

export function workflowStatusOf(ticket: Ticket): WorkflowStatus {
  if (ticket.workflowStatus && isWorkflowStatus(ticket.workflowStatus)) {
    return ticket.workflowStatus;
  }
  if (ticket.assigneeId.trim() === '') {
    return 'Backlog';
  }
  if (ticket.closed) {
    return 'Done';
  }
  if (ticket.reopenCount > 0) {
    return 'Reopened';
  }
  return 'In Progress';
}

export function todayInBangkok(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function moveWorkflow(ticket: Ticket, target: WorkflowStatus, today: string): MoveResult {
  const from = workflowStatusOf(ticket);
  if (from === target) {
    return { ok: true, ticket: { ...ticket, workflowStatus: from } };
  }
  const missing = missingFields(ticket, target);
  if (missing.length > 0) {
    return { ok: false, message: `ขาด ${missing.join(', ')}` };
  }
  const reopenCount = isBounce(from, target) ? ticket.reopenCount + 1 : ticket.reopenCount;
  const actualStartOn =
    target === 'In Progress' && !ticket.actualStartOn ? today : (ticket.actualStartOn ?? null);
  const devDeliveredOn =
    target === 'Ready for QA' && !ticket.devDeliveredOn ? today : (ticket.devDeliveredOn ?? null);
  const closing = target === 'Done' && !ticket.closed;
  return {
    ok: true,
    ticket: {
      ...ticket,
      workflowStatus: target,
      reopenCount,
      actualStartOn,
      devDeliveredOn,
      closed: closing ? true : ticket.closed,
      closedOn: closing ? today : ticket.closedOn,
    },
  };
}

export function editWorkflow(ticket: Ticket, fields: WorkflowFields): MoveResult {
  if (ticket.firstDueOn && fields.firstDueOn !== ticket.firstDueOn) {
    return { ok: false, message: 'วันส่งครั้งแรกถูกล็อกแล้ว' };
  }
  if (fields.storyPoints !== null && !isStoryPoint(fields.storyPoints)) {
    return { ok: false, message: 'Story Points ต้องเป็น 1, 2, 3, 5, 8 หรือ 13' };
  }
  if (fields.discipline && !isDiscipline(fields.discipline)) {
    return { ok: false, message: 'สายงานไม่ถูกต้อง' };
  }
  if (fields.workCategory && !isWorkCategory(fields.workCategory)) {
    return { ok: false, message: 'หมวดไม่ถูกต้อง' };
  }
  const pocResult = fields.workCategory === 'R&D-PoC' && isPocResult(fields.pocResult) ? fields.pocResult : '';
  const bugCause = isBugCategory(fields.workCategory) && isBugCause(fields.bugCause) ? fields.bugCause : '';
  return {
    ok: true,
    ticket: {
      ...ticket,
      discipline: fields.discipline,
      workCategory: fields.workCategory,
      storyPoints: fields.storyPoints,
      firstDueOn: ticket.firstDueOn || fields.firstDueOn,
      mrLink: fields.mrLink.trim(),
      pocResult,
      bugCause,
    },
  };
}

export function pipelineReport(
  tickets: readonly Ticket[],
  people: readonly { id: string; nickname: string }[],
): PipelineReport {
  const names = new Map(people.map((person) => [person.id, person.nickname]));
  const velocity = new Map<string, number>();
  let onTimeHit = 0;
  let onTimeTotal = 0;
  let firstTimeHit = 0;
  const categoryPoints = new Map<WorkCategory, number>();
  for (const key of WORK_CATEGORIES) {
    categoryPoints.set(key, 0);
  }
  for (const ticket of tickets) {
    if (ticket.reopenCount <= 0) {
      firstTimeHit += 1;
    }
    if (ticket.firstDueOn && ticket.devDeliveredOn) {
      onTimeTotal += 1;
      if (ticket.devDeliveredOn <= ticket.firstDueOn) {
        onTimeHit += 1;
      }
    }
    const points = ticket.storyPoints ?? 0;
    const category = ticket.workCategory ?? '';
    if (isWorkCategory(category)) {
      categoryPoints.set(category, (categoryPoints.get(category) ?? 0) + points);
    }
    if (workflowStatusOf(ticket) === 'Done' && ticket.assigneeId.trim() !== '') {
      velocity.set(ticket.assigneeId, (velocity.get(ticket.assigneeId) ?? 0) + points);
    }
  }
  const categoryTotal = [...categoryPoints.values()].reduce((sum, points) => sum + points, 0);
  return {
    velocity: [...velocity.entries()]
      .map(([personId, points]) => ({ personId, name: names.get(personId) ?? personId, points }))
      .sort((left, right) => right.points - left.points || left.name.localeCompare(right.name, 'th')),
    onTimePct: percent(onTimeHit, onTimeTotal),
    onTimeHit,
    onTimeTotal,
    firstTimePct: percent(firstTimeHit, tickets.length),
    firstTimeHit,
    firstTimeTotal: tickets.length,
    categories: WORK_CATEGORIES.map((key) => {
      const points = categoryPoints.get(key) ?? 0;
      return { key, label: CATEGORY_LABELS[key], points, pct: percent(points, categoryTotal) };
    }),
  };
}

/** Fills pipeline fields on seed tickets without touching score inputs. */
export function decorateSeed(ticket: Ticket, seed: Partial<Ticket>): Ticket {
  const status = seed.workflowStatus ?? derivedStatus(ticket);
  const hasAssignee = ticket.assigneeId.trim() !== '';
  const storyPoints =
    seed.storyPoints !== undefined ? seed.storyPoints : hasAssignee ? STORY_BY_SIZE[ticket.size] : null;
  const firstDueOn =
    seed.firstDueOn !== undefined ? seed.firstDueOn : hasAssignee ? (ticket.closedOn ?? '2025-10-31') : null;
  const workCategory =
    seed.workCategory !== undefined ? seed.workCategory : hasAssignee ? CATEGORY_BY_TYPE[ticket.type] : '';
  const discipline =
    seed.discipline !== undefined ? seed.discipline : hasAssignee ? (ticket.track === 'RD' ? 'BE' : 'Full-Stack') : '';
  const mrLink =
    seed.mrLink !== undefined
      ? seed.mrLink
      : RANK[status] >= RANK['Code Review']
        ? `https://git.local/mr/${ticket.id}`
        : '';
  const actualStartOn =
    seed.actualStartOn !== undefined ? seed.actualStartOn : RANK[status] >= RANK['In Progress'] ? '2025-10-06' : null;
  let devDeliveredOn = seed.devDeliveredOn !== undefined ? seed.devDeliveredOn : null;
  if (seed.devDeliveredOn === undefined && RANK[status] >= RANK['Ready for QA'] && firstDueOn) {
    devDeliveredOn = ticket.weekOffset > 0 ? addDays(firstDueOn, 14) : firstDueOn;
  }
  const bugCause =
    seed.bugCause !== undefined ? seed.bugCause : isBugCategory(workCategory) && status === 'Done' ? 'Logic' : '';
  const pocResult =
    seed.pocResult !== undefined ? seed.pocResult : workCategory === 'R&D-PoC' && status === 'Done' ? 'Adopted' : '';
  return {
    ...ticket,
    workflowStatus: status,
    storyPoints,
    firstDueOn,
    workCategory,
    discipline,
    mrLink,
    actualStartOn,
    devDeliveredOn,
    bugCause,
    pocResult,
  };
}

function derivedStatus(ticket: Ticket): WorkflowStatus {
  if (ticket.assigneeId.trim() === '') {
    return 'Backlog';
  }
  if (ticket.closed) {
    return 'Done';
  }
  if (ticket.reopenCount > 0) {
    return 'Reopened';
  }
  return 'In Progress';
}

function missingFields(ticket: Ticket, target: WorkflowStatus): string[] {
  const missing: string[] = [];
  if (RANK[target] >= RANK['In Progress']) {
    if (ticket.assigneeId.trim() === '') {
      missing.push('Assignee');
    }
    if (!isStoryPoint(ticket.storyPoints)) {
      missing.push('Story Points');
    }
    if (!ticket.firstDueOn) {
      missing.push('วันส่ง');
    }
  }
  if (RANK[target] >= RANK['Code Review'] && !(ticket.mrLink ?? '').trim()) {
    missing.push('ลิงก์ MR');
  }
  if (target === 'Done' && isBugCategory(ticket.workCategory) && !(ticket.bugCause ?? '')) {
    missing.push('สาเหตุของ Bug');
  }
  return missing;
}

function isBounce(from: WorkflowStatus, target: WorkflowStatus): boolean {
  return (from === 'Code Review' || from === 'In QA') && RANK[target] < RANK[from];
}

function percent(hit: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((hit / total) * 100);
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

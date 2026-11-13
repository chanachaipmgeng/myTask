import { planNewWork } from './capacity';
import {
  Person,
  Size,
  Ticket,
  TicketType,
  Track,
  VarianceCode,
  WorkflowStatus,
} from './models';
import { FOCUS_HOURS_PER_MD, SIZE_POINTS, SIZE_STANDARD_MD, roundMd } from './scoring';

export type RubricAxis = 'scope' | 'requirement' | 'external' | 'regression';

export interface RubricScores {
  scope: number;
  requirement: number;
  external: number;
  regression: number;
}

export interface MockSprint {
  id: string;
  name: string;
  startOn: string;
  endOn: string;
}

export type ReturnTagKind = 'started' | 'returned' | 'reviewed' | 'reopened' | 'done';

export interface ReturnTag {
  ticketId: string;
  kind: ReturnTagKind;
  on: string;
  /** Focus hours on the done tag. Converted with FOCUS_HOURS_PER_MD. */
  hours?: number;
  reviewRounds?: number;
  varianceCode?: VarianceCode;
  blocker?: boolean;
  dodPassed?: boolean;
  inTimeBox?: boolean;
  childTicketsSized?: boolean;
}

export interface MockTicketBlueprint {
  id: string;
  track: Track;
  type: TicketType;
  module: string;
  title: string;
  rubric: RubricScores;
  /** When true the card enters only after the round is open. */
  lateEntry?: boolean;
  /** Spike estimate override; must stay 0.5 or 1. */
  spikeEstimateMd?: 0.5 | 1;
  note: string;
}

export interface SizedTicketDraft {
  blueprint: MockTicketBlueprint;
  size: Size;
  estimateMd: number;
  storyPoints: number;
  rubricTotal: number;
}

export interface MockSessionState {
  step: number;
  sprint: MockSprint | null;
  roundOpen: boolean;
  drafts: SizedTicketDraft[];
  tickets: Ticket[];
  tagsApplied: ReturnTag[];
  log: string[];
}

export const MOCK_STEPS = [
  { id: 'intake', title: 'รับใบงาน', hint: 'โหลดใบงานจำลอง 6 ใบเข้าคิว' },
  { id: 'rubric', title: 'ประเมินขนาด', hint: 'ให้คะแนนรูบริกแล้วได้ size / estimate' },
  { id: 'sprint', title: 'นำเข้าสปรินต์', hint: 'ใส่ใบเข้าสปรินต์ ยังไม่แจกคน' },
  { id: 'round', title: 'เปิดรอบ', hint: 'ล็อกวันส่ง และทำใบเข้าหลังเปิดรอบเป็นนอกแผน' },
  { id: 'assign', title: 'แจกใบงาน', hint: 'รับข้อเสนอจากโควตา manpower' },
  { id: 'manpower', title: 'แผน manpower', hint: 'ดูโควตาที่เหลือและปฏิทินทีม' },
  { id: 'tags', title: 'แท็กส่งคืน', hint: 'จำลองแท็ก mygitplus บนใบที่มีผู้รับ' },
  { id: 'settle', title: 'คำนวณฟิลด์', hint: 'คำนวณ actualMd / weekOffset / ปิดใบ' },
  { id: 'boards', title: 'แดชบอร์ดและคะแนน', hint: 'เปิดหน้าทีม รายคน คิว ปฏิทิน' },
] as const;

export const MOCK_SPRINT: MockSprint = {
  id: 'mock-2025-w45',
  name: 'Mock Sprint W45',
  startOn: '2025-11-03',
  endOn: '2025-11-07',
};

/** Implement Juniors (free 2 MD) + one R&D Junior so XL 3 MD stays in queue. */
export const MOCK_PERSON_IDS = ['itsara', 'kanchawee', 'nakarin'] as const;

export const MOCK_BLUEPRINTS: readonly MockTicketBlueprint[] = [
  {
    id: 'MOCK-ONTIME',
    track: 'Implement',
    type: 'Feature',
    module: 'Checkout',
    title: 'ปรับปุ่มยืนยันออเดอร์',
    rubric: { scope: 1, requirement: 1, external: 0, regression: 1 },
    note: 'ส่งตรงสัปดาห์',
  },
  {
    id: 'MOCK-SLIP',
    track: 'Implement',
    type: 'Feature',
    module: 'Report',
    title: 'รายงานยอดรายวัน',
    rubric: { scope: 2, requirement: 1, external: 1, regression: 1 },
    note: 'เลื่อน 1 สัปดาห์',
  },
  {
    id: 'MOCK-REWORK',
    track: 'Implement',
    type: 'Bug-Fix',
    module: 'Auth',
    title: 'แก้ล็อกอินซ้ำ',
    rubric: { scope: 2, requirement: 1, external: 1, regression: 2 },
    note: 'รีวิวหลายรอบแล้ว reopen',
  },
  {
    id: 'MOCK-SPIKE',
    track: 'RD',
    type: 'Spike',
    module: 'Search',
    title: 'ทดลอง vector search',
    rubric: { scope: 1, requirement: 1, external: 0, regression: 1 },
    spikeEstimateMd: 0.5,
    note: 'spike ในกรอบเวลา',
  },
  {
    id: 'MOCK-UNPLANNED',
    track: 'Implement',
    type: 'Bug-Fix',
    module: 'Payment',
    title: 'แก้ใบเสร็จหาย',
    rubric: { scope: 1, requirement: 1, external: 0, regression: 1 },
    lateEntry: true,
    note: 'งานนอกแผนหลังเปิดรอบ',
  },
  {
    id: 'MOCK-XL',
    track: 'Implement',
    type: 'Feature',
    module: 'Inventory',
    title: 'ยกเครื่องคลังสินค้า',
    rubric: { scope: 3, requirement: 3, external: 3, regression: 3 },
    note: 'XL ใส่โควตา Junior ไม่ได้',
  },
];

export const MOCK_RETURN_TAGS: readonly ReturnTag[] = [
  { ticketId: 'MOCK-ONTIME', kind: 'started', on: '2025-11-03' },
  { ticketId: 'MOCK-ONTIME', kind: 'returned', on: '2025-11-05' },
  { ticketId: 'MOCK-ONTIME', kind: 'reviewed', on: '2025-11-05', reviewRounds: 1 },
  { ticketId: 'MOCK-ONTIME', kind: 'done', on: '2025-11-06', hours: 3, varianceCode: 'NONE', blocker: false },

  { ticketId: 'MOCK-SLIP', kind: 'started', on: '2025-11-03' },
  { ticketId: 'MOCK-SLIP', kind: 'returned', on: '2025-11-12' },
  { ticketId: 'MOCK-SLIP', kind: 'reviewed', on: '2025-11-12', reviewRounds: 1 },
  { ticketId: 'MOCK-SLIP', kind: 'done', on: '2025-11-13', hours: 6, varianceCode: 'NONE', blocker: false },

  { ticketId: 'MOCK-REWORK', kind: 'started', on: '2025-11-03' },
  { ticketId: 'MOCK-REWORK', kind: 'returned', on: '2025-11-05' },
  { ticketId: 'MOCK-REWORK', kind: 'reviewed', on: '2025-11-05', reviewRounds: 3 },
  { ticketId: 'MOCK-REWORK', kind: 'reopened', on: '2025-11-06' },
  { ticketId: 'MOCK-REWORK', kind: 'returned', on: '2025-11-07' },
  { ticketId: 'MOCK-REWORK', kind: 'reviewed', on: '2025-11-07', reviewRounds: 3 },
  {
    ticketId: 'MOCK-REWORK',
    kind: 'done',
    on: '2025-11-07',
    hours: 6,
    varianceCode: 'NONE',
    blocker: false,
  },

  { ticketId: 'MOCK-SPIKE', kind: 'started', on: '2025-11-03' },
  { ticketId: 'MOCK-SPIKE', kind: 'returned', on: '2025-11-04' },
  { ticketId: 'MOCK-SPIKE', kind: 'reviewed', on: '2025-11-04', reviewRounds: 1 },
  {
    ticketId: 'MOCK-SPIKE',
    kind: 'done',
    on: '2025-11-04',
    hours: 3,
    varianceCode: 'NONE',
    blocker: false,
    dodPassed: true,
    inTimeBox: true,
    childTicketsSized: true,
  },

  { ticketId: 'MOCK-UNPLANNED', kind: 'started', on: '2025-11-05' },
  { ticketId: 'MOCK-UNPLANNED', kind: 'returned', on: '2025-11-06' },
  { ticketId: 'MOCK-UNPLANNED', kind: 'reviewed', on: '2025-11-06', reviewRounds: 1 },
  {
    ticketId: 'MOCK-UNPLANNED',
    kind: 'done',
    on: '2025-11-06',
    hours: 3,
    varianceCode: 'NONE',
    blocker: false,
  },
];

const STORY_BY_SIZE: Record<Size, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8,
};

const CATEGORY_BY_TYPE: Record<TicketType, Ticket['workCategory']> = {
  Feature: 'Feature',
  CR: 'Feature',
  'Bug-Investigate': 'BugInternal',
  'Bug-Fix': 'BugInternal',
  Spike: 'R&D-PoC',
  Ops: 'Feature',
  TechDebt: 'Refactor',
};

export function emptyMockState(): MockSessionState {
  return {
    step: 0,
    sprint: null,
    roundOpen: false,
    drafts: [],
    tickets: [],
    tagsApplied: [],
    log: [],
  };
}

export function clampRubricScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(3, Math.round(value)));
}

export function rubricTotal(scores: RubricScores): number {
  return (
    clampRubricScore(scores.scope) +
    clampRubricScore(scores.requirement) +
    clampRubricScore(scores.external) +
    clampRubricScore(scores.regression)
  );
}

export function sizeFromRubricTotal(total: number): Size {
  if (total <= 2) {
    return 'XS';
  }
  if (total <= 4) {
    return 'S';
  }
  if (total <= 7) {
    return 'M';
  }
  if (total <= 10) {
    return 'L';
  }
  return 'XL';
}

export function estimateFromSize(size: Size, type: TicketType, spikeEstimateMd?: 0.5 | 1): number {
  if (type === 'Spike') {
    return spikeEstimateMd ?? 0.5;
  }
  return SIZE_STANDARD_MD[size];
}

export function sizeBlueprint(blueprint: MockTicketBlueprint): SizedTicketDraft {
  const total = rubricTotal(blueprint.rubric);
  const size = sizeFromRubricTotal(total);
  const estimateMd = estimateFromSize(size, blueprint.type, blueprint.spikeEstimateMd);
  return {
    blueprint,
    size,
    estimateMd,
    storyPoints: STORY_BY_SIZE[size],
    rubricTotal: total,
  };
}

export function intakeTickets(): Ticket[] {
  return MOCK_BLUEPRINTS.filter((item) => !item.lateEntry).map((item) => blankTicket(item));
}

export function estimateDrafts(blueprints: readonly MockTicketBlueprint[] = MOCK_BLUEPRINTS): SizedTicketDraft[] {
  return blueprints.map(sizeBlueprint);
}

export function applyEstimates(tickets: readonly Ticket[], drafts: readonly SizedTicketDraft[]): Ticket[] {
  const byId = new Map(drafts.map((draft) => [draft.blueprint.id, draft]));
  return tickets.map((ticket) => {
    const draft = byId.get(ticket.id);
    if (!draft) {
      return ticket;
    }
    return {
      ...ticket,
      size: draft.size,
      estimateMd: draft.estimateMd,
      storyPoints: draft.storyPoints as Ticket['storyPoints'],
      note: draft.blueprint.note,
      title: draft.blueprint.title,
    };
  });
}

export function enterSprint(tickets: readonly Ticket[], sprint: MockSprint = MOCK_SPRINT): Ticket[] {
  return tickets.map((ticket) => ({
    ...ticket,
    assigneeId: '',
    workflowStatus: 'Backlog' as WorkflowStatus,
    firstDueOn: null,
    dueOn: null,
    note: ticket.note ? `${ticket.note} · ${sprint.name}` : sprint.name,
  }));
}

export function openRound(
  tickets: readonly Ticket[],
  drafts: readonly SizedTicketDraft[],
  sprint: MockSprint = MOCK_SPRINT,
): Ticket[] {
  const late = drafts
    .filter((draft) => draft.blueprint.lateEntry)
    .map((draft) => {
      const sized = applyEstimates(
        [
          {
            ...blankTicket(draft.blueprint),
            unplanned: true,
            note: `${draft.blueprint.note} · ${sprint.name}`,
          },
        ],
        [draft],
      )[0];
      return {
        ...sized,
        firstDueOn: sprint.endOn,
        dueOn: sprint.endOn,
      };
    });
  const existing = new Set(tickets.map((ticket) => ticket.id));
  const withDue = tickets.map((ticket) => ({
    ...ticket,
    firstDueOn: ticket.firstDueOn ?? sprint.endOn,
    dueOn: ticket.dueOn ?? sprint.endOn,
  }));
  return [...withDue, ...late.filter((ticket) => !existing.has(ticket.id))];
}

export function assignFromCapacity(
  people: readonly Person[],
  tickets: readonly Ticket[],
): { tickets: Ticket[]; assigned: string[]; skipped: string[] } {
  const { plans } = planNewWork(people, tickets);
  const assigned = new Map<string, string>();
  const skipped: string[] = [];
  for (const plan of plans) {
    if (plan.fits && plan.personId) {
      assigned.set(plan.ticket.id, plan.personId);
    } else {
      skipped.push(plan.ticket.id);
    }
  }
  return {
    tickets: tickets.map((ticket) => {
      const personId = assigned.get(ticket.id);
      if (!personId || ticket.assigneeId.trim() !== '') {
        return ticket;
      }
      return {
        ...ticket,
        assigneeId: personId,
        workflowStatus: 'Backlog',
      };
    }),
    assigned: [...assigned.keys()],
    skipped,
  };
}

export function applyReturnTags(tickets: readonly Ticket[], tags: readonly ReturnTag[]): Ticket[] {
  const byId = new Map(tickets.map((ticket) => [ticket.id, { ...ticket }]));
  for (const tag of tags) {
    const ticket = byId.get(tag.ticketId);
    if (!ticket || ticket.assigneeId.trim() === '') {
      continue;
    }
    byId.set(tag.ticketId, applyOneTag(ticket, tag));
  }
  return tickets.map((ticket) => byId.get(ticket.id) ?? ticket);
}

export function settleTicket(ticket: Ticket): Ticket {
  if (!ticket.closed || ticket.assigneeId.trim() === '') {
    return decorateOpen(ticket);
  }
  const weekOffset = weekOffsetFromDates(ticket.firstDueOn ?? null, ticket.devDeliveredOn ?? null);
  const workCategory = ticket.workCategory || CATEGORY_BY_TYPE[ticket.type] || '';
  const discipline =
    ticket.discipline || (ticket.track === 'RD' ? 'BE' : ticket.type === 'Spike' ? 'AI-Data' : 'Full-Stack');
  return {
    ...ticket,
    weekOffset,
    workflowStatus: 'Done',
    workCategory,
    discipline,
    mrLink: ticket.mrLink || `https://git.local/mr/${ticket.id}`,
    storyPoints: ticket.storyPoints ?? (SIZE_POINTS[ticket.size] as Ticket['storyPoints']),
    closed: true,
    closedOn: ticket.closedOn,
  };
}

export function settleTickets(tickets: readonly Ticket[]): Ticket[] {
  return tickets.map(settleTicket);
}

export function hoursToActualMd(hours: number): number {
  return roundMd(hours / FOCUS_HOURS_PER_MD);
}

export function weekOffsetFromDates(firstDueOn: string | null, deliveredOn: string | null): number {
  if (!firstDueOn || !deliveredOn) {
    return 0;
  }
  const due = parseIso(firstDueOn);
  const delivered = parseIso(deliveredOn);
  if (!due || !delivered) {
    return 0;
  }
  const diffDays = Math.floor((delivered.getTime() - due.getTime()) / 86_400_000);
  if (diffDays <= 0) {
    return 0;
  }
  if (diffDays <= 7) {
    return 1;
  }
  return 2;
}

export function filterMockPeople(people: readonly Person[]): Person[] {
  const wanted = new Set<string>(MOCK_PERSON_IDS);
  return people.filter((person) => wanted.has(person.id));
}

function blankTicket(blueprint: MockTicketBlueprint): Ticket {
  return {
    id: blueprint.id,
    track: blueprint.track,
    type: blueprint.type,
    module: blueprint.module,
    size: 'S',
    estimateMd: 0.5,
    actualMd: 0,
    weekOffset: 0,
    reviewRounds: 0,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: false,
    childTicketsSized: false,
    unplanned: Boolean(blueprint.lateEntry),
    assigneeId: '',
    closedOn: null,
    workingDaysLeft: null,
    note: blueprint.note,
    title: blueprint.title,
    workflowStatus: 'Backlog',
    discipline: '',
    workCategory: '',
    storyPoints: null,
    firstDueOn: null,
    dueOn: null,
    mrLink: '',
    pocResult: '',
    bugCause: '',
    actualStartOn: null,
    devDeliveredOn: null,
    source: 'local',
  };
}

function applyOneTag(ticket: Ticket, tag: ReturnTag): Ticket {
  switch (tag.kind) {
    case 'started':
      return {
        ...ticket,
        actualStartOn: ticket.actualStartOn ?? tag.on,
        workflowStatus: 'In Progress',
      };
    case 'returned':
      return {
        ...ticket,
        devDeliveredOn: tag.on,
        workflowStatus: 'Ready for QA',
        mrLink: ticket.mrLink || `https://git.local/mr/${ticket.id}`,
      };
    case 'reviewed':
      return {
        ...ticket,
        reviewRounds: tag.reviewRounds ?? ticket.reviewRounds,
        workflowStatus: ticket.workflowStatus === 'Reopened' ? 'Reopened' : 'Code Review',
      };
    case 'reopened':
      return {
        ...ticket,
        reopenCount: ticket.reopenCount + 1,
        workflowStatus: 'Reopened',
      };
    case 'done':
      return {
        ...ticket,
        closed: true,
        closedOn: tag.on,
        actualMd: tag.hours != null ? hoursToActualMd(tag.hours) : ticket.actualMd,
        varianceCode: tag.varianceCode ?? ticket.varianceCode,
        blocker: tag.blocker ?? ticket.blocker,
        dodPassed: tag.dodPassed ?? ticket.dodPassed,
        inTimeBox: tag.inTimeBox ?? ticket.inTimeBox,
        childTicketsSized: tag.childTicketsSized ?? ticket.childTicketsSized,
        workflowStatus: 'Done',
        bugCause:
          ticket.type === 'Bug-Fix' || ticket.type === 'Bug-Investigate'
            ? ticket.bugCause || 'Logic'
            : ticket.bugCause,
        pocResult: ticket.type === 'Spike' ? ticket.pocResult || 'Adopted' : ticket.pocResult,
      };
    default:
      return ticket;
  }
}

function decorateOpen(ticket: Ticket): Ticket {
  if (ticket.assigneeId.trim() === '') {
    return {
      ...ticket,
      workflowStatus: 'Backlog',
      storyPoints: ticket.storyPoints ?? (SIZE_POINTS[ticket.size] as Ticket['storyPoints']),
    };
  }
  return {
    ...ticket,
    workCategory: ticket.workCategory || CATEGORY_BY_TYPE[ticket.type] || '',
    discipline:
      ticket.discipline || (ticket.track === 'RD' ? 'BE' : ticket.type === 'Spike' ? 'AI-Data' : 'Full-Stack'),
    storyPoints: ticket.storyPoints ?? (SIZE_POINTS[ticket.size] as Ticket['storyPoints']),
  };
}

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

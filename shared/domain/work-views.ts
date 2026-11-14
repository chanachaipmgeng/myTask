import { Person, Ticket, Track, WORKFLOW_STATUSES, WorkflowStatus } from './models';
import { todayInBangkok, workflowStatusOf } from './workflow';

export type WorkTrackFilter = Track | 'All';

export interface WorkSummaryCard {
  id: string;
  label: string;
  value: string;
  hint: string;
}

export interface WorkChartPoint {
  x: string;
  y: number;
  text: string;
}

export interface WorkWipBar {
  personId: string;
  nickname: string;
  openCount: number;
  openMd: number;
}

export interface WorkSummaryView {
  cards: WorkSummaryCard[];
  statusShare: WorkChartPoint[];
  trackShare: WorkChartPoint[];
  wipBars: WorkWipBar[];
}

export interface WorkGanttTask {
  TaskID: string;
  TaskName: string;
  ParentID: string | null;
  StartDate: Date | null;
  EndDate: Date | null;
  BaselineStartDate: Date | null;
  BaselineEndDate: Date | null;
  Duration: number | null;
  Progress: number;
  ResourceInfo: { resourceId: string; resourceName: string }[];
  slipped: boolean;
  closed: boolean;
  track: Track;
}

export interface WorkBacklogRow {
  id: string;
  title: string;
  trackLabel: string;
  type: string;
  size: string;
  estimateMd: number;
  assignee: string;
  status: string;
}

export interface WorkListRow {
  id: string;
  workLabel: string;
  title: string;
  type: string;
  assignee: string;
  status: string;
  size: string;
  dueOnLabel: string;
  closedOnLabel: string;
  unplannedLabel: string;
  weekOffsetLabel: string;
  track: Track;
}

function parseDay(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00+07:00`);
  return Number.isNaN(t) ? null : new Date(t);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function matchesTrack(ticket: Ticket, track: WorkTrackFilter): boolean {
  return track === 'All' || ticket.track === track;
}

function matchesQuery(ticket: Ticket, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const hay = `${ticket.id} ${ticket.title ?? ''} ${ticket.module} ${ticket.type}`.toLowerCase();
  return hay.includes(q);
}

export function filterWorkTickets(
  tickets: readonly Ticket[],
  options?: { track?: WorkTrackFilter; query?: string },
): Ticket[] {
  const track = options?.track ?? 'All';
  const query = options?.query ?? '';
  return tickets.filter((ticket) => matchesTrack(ticket, track) && matchesQuery(ticket, query));
}

export function workSummaryStats(
  tickets: readonly Ticket[],
  people: readonly Person[],
  options?: { track?: WorkTrackFilter; query?: string; today?: string },
): WorkSummaryView {
  const filtered = filterWorkTickets(tickets, options);
  const today = options?.today ?? todayInBangkok();
  const open = filtered.filter((ticket) => !ticket.closed);
  const closed = filtered.filter((ticket) => ticket.closed);
  const overdue = open.filter((ticket) => {
    const due = ticket.dueOn ?? ticket.firstDueOn;
    return !!due && due < today;
  });
  const unplanned = filtered.filter((ticket) => ticket.unplanned);
  const openMd = open.reduce((sum, ticket) => sum + (ticket.estimateMd || 0), 0);

  const statusCounts = new Map<WorkflowStatus, number>();
  for (const status of WORKFLOW_STATUSES) {
    statusCounts.set(status, 0);
  }
  for (const ticket of filtered) {
    const status = workflowStatusOf(ticket);
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }
  const statusShare = WORKFLOW_STATUSES.map((status) => {
    const y = statusCounts.get(status) ?? 0;
    return { x: status, y, text: `${status} ${y}` };
  }).filter((point) => point.y > 0);

  const implement = filtered.filter((ticket) => ticket.track === 'Implement').length;
  const rd = filtered.filter((ticket) => ticket.track === 'RD').length;
  const trackShare: WorkChartPoint[] = [
    { x: 'Implement', y: implement, text: `Implement ${implement}` },
    { x: 'R&D', y: rd, text: `R&D ${rd}` },
  ].filter((point) => point.y > 0);

  const names = new Map(people.map((person) => [person.id, person.nickname]));
  const byPerson = new Map<string, { openCount: number; openMd: number }>();
  for (const ticket of open) {
    if (!ticket.assigneeId) {
      continue;
    }
    const row = byPerson.get(ticket.assigneeId) ?? { openCount: 0, openMd: 0 };
    row.openCount += 1;
    row.openMd += ticket.estimateMd || 0;
    byPerson.set(ticket.assigneeId, row);
  }
  const wipBars = [...byPerson.entries()]
    .map(([personId, row]) => ({
      personId,
      nickname: names.get(personId) ?? personId,
      openCount: row.openCount,
      openMd: Math.round(row.openMd * 100) / 100,
    }))
    .sort((a, b) => b.openMd - a.openMd || b.openCount - a.openCount)
    .slice(0, 8);

  return {
    cards: [
      { id: 'open', label: 'เปิดอยู่', value: String(open.length), hint: `${formatMd(openMd)} MD ประมาณ` },
      { id: 'closed', label: 'ปิดแล้ว', value: String(closed.length), hint: `จาก ${filtered.length} ใบในมุมมอง` },
      { id: 'overdue', label: 'เกิน due', value: String(overdue.length), hint: `เทียบวันนี้ ${today}` },
      { id: 'unplanned', label: 'นอกแผน', value: String(unplanned.length), hint: 'ติ๊ก Unplanned' },
    ],
    statusShare,
    trackShare,
    wipBars,
  };
}

export function workGanttTasks(
  tickets: readonly Ticket[],
  people: readonly Person[],
  options?: { track?: WorkTrackFilter; query?: string },
): WorkGanttTask[] {
  const names = new Map(people.map((person) => [person.id, person.nickname]));
  const visible = filterWorkTickets(tickets, options).filter(
    (ticket) => !!(ticket.actualStartOn || ticket.firstDueOn || ticket.dueOn || ticket.closedOn),
  );
  const visibleIds = new Set(visible.map((ticket) => ticket.id));
  return visible.map((ticket) => {
    const start =
      parseDay(ticket.actualStartOn) ??
      parseDay(ticket.firstDueOn) ??
      parseDay(ticket.dueOn) ??
      parseDay(ticket.closedOn);
    const end =
      parseDay(ticket.closedOn) ??
      parseDay(ticket.dueOn) ??
      parseDay(ticket.firstDueOn) ??
      (start ? addDays(start, Math.max(1, Math.ceil(ticket.estimateMd || 1))) : null);
    const baselineStart = parseDay(ticket.firstDueOn) ?? start;
    const baselineEnd =
      baselineStart && ticket.estimateMd > 0
        ? addDays(baselineStart, Math.max(1, Math.ceil(ticket.estimateMd)))
        : parseDay(ticket.dueOn) ?? end;
    const duration =
      start && end
        ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) || 1)
        : ticket.estimateMd > 0
          ? Math.max(1, Math.ceil(ticket.estimateMd))
          : null;
    const rawParent = ticket.parentId?.trim() || null;
    const parentId = rawParent && rawParent !== ticket.id && visibleIds.has(rawParent) ? rawParent : null;
    return {
      TaskID: ticket.id,
      TaskName: (ticket.title?.trim() || ticket.module || ticket.id).slice(0, 80),
      ParentID: parentId,
      StartDate: start,
      EndDate: end,
      BaselineStartDate: baselineStart,
      BaselineEndDate: baselineEnd,
      Duration: duration,
      Progress: ticket.closed ? 100 : workflowStatusOf(ticket) === 'Backlog' ? 0 : 40,
      ResourceInfo: ticket.assigneeId
        ? [{ resourceId: ticket.assigneeId, resourceName: names.get(ticket.assigneeId) ?? ticket.assigneeId }]
        : [],
      slipped: ticket.weekOffset > 0,
      closed: ticket.closed,
      track: ticket.track,
    };
  });
}

export type GanttDateEditResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; message: string };

/**
 * Updates actualStartOn and dueOn on an open ticket from Gantt timeline edits.
 * Never overwrites firstDueOn (locked initial promise) and rejects edits on closed tickets.
 */
export function applyGanttDateEdit(
  ticket: Ticket,
  edit: { startDate?: string | null; dueDate?: string | null },
): GanttDateEditResult {
  if (ticket.closed) {
    return { ok: false, message: 'ใบงานปิดแล้ว แก้ไขวันบน Timeline ไม่ได้' };
  }
  const nextStart = edit.startDate !== undefined ? edit.startDate : (ticket.actualStartOn ?? null);
  const nextDue = edit.dueDate !== undefined ? edit.dueDate : (ticket.dueOn ?? null);
  if (nextStart && nextDue && nextDue < nextStart) {
    return { ok: false, message: 'วันครบกำหนดต้องไม่ก่อนวันเริ่ม' };
  }
  return {
    ok: true,
    ticket: {
      ...ticket,
      actualStartOn: nextStart,
      dueOn: nextDue,
      firstDueOn: ticket.firstDueOn ?? nextDue ?? null,
    },
  };
}

export function workBacklogRows(
  tickets: readonly Ticket[],
  people: readonly Person[],
  options?: { track?: WorkTrackFilter; query?: string },
): WorkBacklogRow[] {
  const names = new Map(people.map((person) => [person.id, person.nickname]));
  return filterWorkTickets(tickets, options)
    .filter((ticket) => {
      if (ticket.closed) {
        return false;
      }
      const status = workflowStatusOf(ticket);
      return status === 'Backlog' || ticket.assigneeId === '';
    })
    .map((ticket) => ({
      id: ticket.id,
      title: ticket.title?.trim() || ticket.module || ticket.id,
      trackLabel: ticket.track === 'RD' ? 'R&D' : 'Implement',
      type: ticket.type,
      size: ticket.size,
      estimateMd: ticket.estimateMd,
      assignee: ticket.assigneeId ? (names.get(ticket.assigneeId) ?? ticket.assigneeId) : 'ยังไม่มีผู้รับ',
      status: workflowStatusOf(ticket),
    }));
}

export function workListRows(
  tickets: readonly Ticket[],
  people: readonly Person[],
  options?: { track?: WorkTrackFilter; query?: string },
): WorkListRow[] {
  const names = new Map(people.map((person) => [person.id, person.nickname]));
  return filterWorkTickets(tickets, options).map((ticket) => {
    const title = ticket.title?.trim() || ticket.module || ticket.id;
    return {
      id: ticket.id,
      workLabel: `${ticket.id} · ${title}`,
      title,
      type: ticket.type,
      assignee: ticket.assigneeId ? (names.get(ticket.assigneeId) ?? ticket.assigneeId) : 'Unassigned',
      status: workflowStatusOf(ticket),
      size: ticket.size,
      dueOnLabel: ticket.dueOn ?? ticket.firstDueOn ?? '—',
      closedOnLabel: ticket.closedOn ?? '—',
      unplannedLabel: ticket.unplanned ? 'นอกแผน' : 'ในแผน',
      weekOffsetLabel: ticket.weekOffset === 0 ? 'ตรงสัปดาห์' : `เลื่อน +${ticket.weekOffset}`,
      track: ticket.track,
    };
  });
}

function formatMd(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

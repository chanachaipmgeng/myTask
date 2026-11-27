import {
  Person,
  Ticket,
  Track,
  TrackCode,
  normalizeTrack,
  trackDisplayLabel,
  WORKFLOW_STATUSES,
  WorkflowStatus,
} from './models';
import { slugifyTeamName, teamLabelForId } from './op-team-staging';
import { evaluatePolicySla, PolicySlaEvaluation } from './policy-sla';
import { todayInBangkok, workflowStatusOf } from './workflow';

export type WorkTrackFilter = Track | TrackCode | 'All';

/** ถังวันส่งสำหรับจัดกลุ่มงานค้าง */
export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'later' | 'all';

export type WorkFilterOptions = {
  track?: WorkTrackFilter;
  query?: string;
  /** When set, keep only tickets assigned to this person. */
  assigneeId?: string;
  today?: string;
  /** กรองตามทีมของผู้รับ (Person.teamId หรือ fallback สายงาน) */
  teamId?: string;
  /** กรองตามโปรเจกต์ OpenProject / โมดูล */
  opProject?: string;
  /** กรองตามชนิดใบงานจริงจาก OpenProject (opType) หรือ TicketType */
  opType?: string;
  /** กรองถังวันส่ง (all = ไม่กรอง) */
  dueBucket?: DueBucket;
  /** สถานะใบงาน: 'unclosed' (ยังไม่ปิด - ค่าเริ่ม), 'closed' (ปิดแล้ว), 'all' (ทั้งหมด) */
  statusScope?: 'unclosed' | 'closed' | 'all';
  /** จันทร์ของสัปดาห์ที่กำลังดู (YYYY-MM-DD) — กรอง due ในสัปดาห์ + เกินกำหนดที่ยังค้าง */
  weekStart?: string;
  /** รายชื่อคนสำหรับแมป assignee → teamId (จำเป็นเมื่อใช้ teamId) */
  people?: readonly Person[];
};

export const DUE_BUCKET_LABELS: Record<Exclude<DueBucket, 'all'>, string> = {
  overdue: 'เกินกำหนด',
  today: 'วันนี้',
  tomorrow: 'พรุ่งนี้',
  thisWeek: 'สัปดาห์นี้',
  later: 'หลังจากนี้',
};

export const DUE_BUCKET_ORDER: Exclude<DueBucket, 'all'>[] = [
  'overdue',
  'today',
  'tomorrow',
  'thisWeek',
  'later',
];

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
  priorityLabel: string;
  size: string;
  dueOnLabel: string;
  receiptDateLabel: string;
  alertDateLabel: string;
  policyDateLabel: string;
  replyDateLabel: string;
  policySlaLabel: string;
  policySlaTone: PolicySlaEvaluation['tone'];
  policyAuto: boolean;
  closedOnLabel: string;
  unplannedLabel: string;
  weekOffsetLabel: string;
  track: Track;
  projectLabel: string;
  teamLabel: string;
  teamId: string;
  opProject: string;
}

export interface OpenWorkItem {
  id: string;
  title: string;
  assignee: string;
  status: string;
  dueOn: string | null;
  projectLabel: string;
  teamLabel: string;
  track: Track;
  estimateMd: number;
  bucket: Exclude<DueBucket, 'all'>;
}

export interface OpenWorkProjectGroup {
  projectKey: string;
  projectLabel: string;
  items: OpenWorkItem[];
  totalCount?: number;
}

export interface OpenWorkBucketGroup {
  bucket: Exclude<DueBucket, 'all'>;
  label: string;
  count: number;
  projects: OpenWorkProjectGroup[];
}

export interface OpenWorkGroupedView {
  buckets: OpenWorkBucketGroup[];
  counts: Record<Exclude<DueBucket, 'all'>, number>;
  totalOpen: number;
}

function parseDay(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const dayStr = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) {
    return null;
  }
  const t = Date.parse(`${dayStr}T00:00:00Z`);
  return Number.isNaN(t) ? null : new Date(t);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** เลื่อนวันปฏิทินแบบ YYYY-MM-DD (pure UTC calendar math ไม่เพี้ยนข้าม timezone) */
export function shiftIsoDay(isoDay: string, days: number): string {
  const base = parseDay(isoDay.slice(0, 10)) ?? parseDay(todayInBangkok());
  if (!base) {
    return isoDay.slice(0, 10);
  }
  return addDays(base, days).toISOString().slice(0, 10);
}

/** จันทร์ของสัปดาห์ที่วันนั้นอยู่ (ISO week Mon–Sun) */
export function mondayOfWeek(isoDay?: string): string {
  const day = (isoDay ?? todayInBangkok()).slice(0, 10);
  const d = parseDay(day);
  if (!d) {
    return day;
  }
  const wd = d.getUTCDay();
  const offset = wd === 0 ? -6 : 1 - wd;
  return addDays(d, offset).toISOString().slice(0, 10);
}

export function fridayOfWeek(mondayIso: string): string {
  return shiftIsoDay(mondayIso.slice(0, 10), 4);
}

/** ทีมของผู้รับ — สอดคล้องกับ team-visibility.ts: ใช้ teamId ก่อน แล้วค่อย department / สายงาน */
export function resolvePersonTeamId(person: Person | undefined, ticketTrack?: Track): string {
  const raw = person?.teamId?.trim();
  if (raw) {
    return raw;
  }
  const dept = person?.department?.trim();
  if (dept) {
    return slugifyTeamName(dept);
  }
  const track = person?.track ?? ticketTrack;
  if (track) {
    const code = normalizeTrack(track);
    if (code === 'RND') return 'rd';
    if (code === 'IMP') return 'implement';
    return code.toLowerCase();
  }
  return 'unassigned';
}

export function resolveTeamLabel(
  teamId: string,
  person?: Person,
  teams?: readonly { id: string; name?: string | null }[],
): string {
  if (person?.department?.trim()) {
    return person.department.trim();
  }
  return teamLabelForId(teamId, teams);
}

export function resolveProjectKey(ticket: Ticket): string {
  const op = ticket.opProject?.trim();
  if (op) {
    return op;
  }
  const mod = ticket.module?.trim();
  if (mod) {
    return mod;
  }
  return '';
}

export function resolveProjectLabel(ticket: Ticket): string {
  const key = resolveProjectKey(ticket);
  return key || 'ไม่มีโปรเจกต์';
}

export function ticketDueDay(ticket: Ticket): string | null {
  const raw = ticket.dueOn ?? ticket.firstDueOn ?? null;
  return raw ? raw.slice(0, 10) : null;
}

/** จัดถังวันส่งเทียบวันนี้และจันทร์ของสัปดาห์ (ค่าเริ่ม = สัปดาห์ของ today) */
export function dueBucketOf(
  ticket: Ticket,
  today = todayInBangkok(),
  weekStart = mondayOfWeek(today),
): Exclude<DueBucket, 'all'> {
  const due = ticketDueDay(ticket);
  if (!due) {
    return 'later';
  }
  if (due < today) {
    return 'overdue';
  }
  if (due === today) {
    return 'today';
  }
  const tomorrow = shiftIsoDay(today, 1);
  if (due === tomorrow) {
    return 'tomorrow';
  }
  const weekEnd = fridayOfWeek(weekStart);
  if (due <= weekEnd) {
    return 'thisWeek';
  }
  return 'later';
}

function matchesTrack(ticket: Ticket, track: WorkTrackFilter): boolean {
  return track === 'All' || normalizeTrack(ticket.track) === normalizeTrack(track);
}

function matchesQuery(ticket: Ticket, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const hay = `${ticket.id} ${ticket.title ?? ''} ${ticket.module} ${ticket.opType ?? ''} ${ticket.type} ${ticket.opProject ?? ''}`.toLowerCase();
  return hay.includes(q);
}

function peopleById(people: readonly Person[] | undefined): Map<string, Person> {
  const map = new Map<string, Person>();
  for (const person of people ?? []) {
    map.set(person.id, person);
    if (person.openprojectUserId != null) {
      map.set(`op:${person.openprojectUserId}`, person);
    }
  }
  return map;
}

export function filterWorkTickets(
  tickets: readonly Ticket[],
  options?: WorkFilterOptions,
): Ticket[] {
  const track = options?.track ?? 'All';
  const query = options?.query ?? '';
  const assigneeId = options?.assigneeId?.trim() ?? '';
  const teamId = options?.teamId?.trim() ?? '';
  const opProject = options?.opProject?.trim() ?? '';
  const opType = options?.opType?.trim() ?? '';
  const dueBucket = options?.dueBucket ?? 'all';
  const statusScope = options?.statusScope;
  const today = options?.today ?? todayInBangkok();
  const weekStart = options?.weekStart?.trim() || mondayOfWeek(today);
  const peopleMap = peopleById(options?.people);

  return tickets.filter((ticket) => {
    if (statusScope === 'unclosed' && ticket.closed) {
      return false;
    }
    if (statusScope === 'closed' && !ticket.closed) {
      return false;
    }
    if (!matchesTrack(ticket, track) || !matchesQuery(ticket, query)) {
      return false;
    }
    if (assigneeId && ticket.assigneeId !== assigneeId) {
      return false;
    }
    if (opType) {
      const displayType = (ticket.opType ?? '').trim() || ticket.type;
      if (displayType !== opType && ticket.type !== opType) {
        return false;
      }
    }
    if (teamId) {
      const person = ticket.assigneeId ? peopleMap.get(ticket.assigneeId) : undefined;
      if (resolvePersonTeamId(person, ticket.track) !== teamId) {
        return false;
      }
    }
    if (opProject) {
      const key = resolveProjectKey(ticket);
      if (opProject === '__none__') {
        if (key) {
          return false;
        }
      } else if (key !== opProject && resolveProjectLabel(ticket) !== opProject) {
        return false;
      }
    }
    // weekStart ใช้กำหนดขอบเขตถัง «สัปดาห์นี้» — ไม่ตัดใบ due นอกสัปดาห์ออกจาก Board/List
    if (dueBucket !== 'all') {
      if (dueBucketOf(ticket, today, weekStart) !== dueBucket) {
        return false;
      }
    }
    return true;
  });
}

/** รายการทีมที่ใช้ในตัวกรอง (จาก roster) */
export function listWorkTeamOptions(people: readonly Person[]): { id: string; label: string }[] {
  const map = new Map<string, string>();
  for (const person of people) {
    if (person.active === false) {
      continue;
    }
    const id = resolvePersonTeamId(person);
    if (!map.has(id)) {
      map.set(id, resolveTeamLabel(id, person));
    }
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'th'));
}

/** รายการโปรเจกต์จากใบในมุมมอง (ก่อนกรองโปรเจกต์) */
export function listWorkProjectOptions(tickets: readonly Ticket[]): { id: string; label: string }[] {
  const map = new Map<string, string>();
  for (const ticket of tickets) {
    const key = resolveProjectKey(ticket);
    const label = resolveProjectLabel(ticket);
    const id = key || '__none__';
    if (!map.has(id)) {
      map.set(id, label);
    }
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id: id === '__none__' ? '' : id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'th'));
}

/**
 * จัดกลุ่มใบเปิดตามถังวันส่ง แล้ว subgroup ตามโปรเจกต์
 */
export function groupOpenWorkByDueBucket(
  tickets: readonly Ticket[],
  people: readonly Person[],
  options?: WorkFilterOptions,
): OpenWorkGroupedView {
  const today = options?.today ?? todayInBangkok();
  const weekStart = options?.weekStart?.trim() || mondayOfWeek(today);
  const filtered = filterWorkTickets(tickets, {
    ...options,
    today,
    weekStart: options?.weekStart,
    people: options?.people ?? people,
    // จัดกลุ่มใช้ถังเอง — ไม่ซ้ำกรอง dueBucket จาก options เมื่อต้องการภาพรวม
    dueBucket: 'all',
  }).filter((ticket) => !ticket.closed);

  const counts: Record<Exclude<DueBucket, 'all'>, number> = {
    overdue: 0,
    today: 0,
    tomorrow: 0,
    thisWeek: 0,
    later: 0,
  };
  const byBucket = new Map<Exclude<DueBucket, 'all'>, Ticket[]>();
  for (const bucket of DUE_BUCKET_ORDER) {
    byBucket.set(bucket, []);
  }
  const names = new Map(people.map((person) => [person.id, person]));
  for (const ticket of filtered) {
    const bucket = dueBucketOf(ticket, today, weekStart);
    counts[bucket] += 1;
    byBucket.get(bucket)!.push(ticket);
  }

  const wanted = options?.dueBucket && options.dueBucket !== 'all' ? [options.dueBucket] : DUE_BUCKET_ORDER;
  const buckets: OpenWorkBucketGroup[] = wanted.map((bucket) => {
    const list = byBucket.get(bucket) ?? [];
    const projectMap = new Map<string, OpenWorkItem[]>();
    for (const ticket of list) {
      const person = ticket.assigneeId ? names.get(ticket.assigneeId) : undefined;
      const teamId = resolvePersonTeamId(person, ticket.track);
      const projectKey = resolveProjectKey(ticket) || '__none__';
      const item: OpenWorkItem = {
        id: ticket.id,
        title: ticket.title?.trim() || ticket.module || ticket.id,
        assignee: person?.nickname ?? (ticket.assigneeId || 'ยังไม่มีผู้รับ'),
        status: workflowStatusOf(ticket),
        dueOn: ticketDueDay(ticket),
        projectLabel: resolveProjectLabel(ticket),
        teamLabel: resolveTeamLabel(teamId, person),
        track: ticket.track,
        estimateMd: ticket.estimateMd || 0,
        bucket,
      };
      const arr = projectMap.get(projectKey) ?? [];
      arr.push(item);
      projectMap.set(projectKey, arr);
    }
    const projects: OpenWorkProjectGroup[] = [...projectMap.entries()]
      .map(([projectKey, items]) => ({
        projectKey: projectKey === '__none__' ? '' : projectKey,
        projectLabel: items[0]?.projectLabel ?? 'ไม่มีโปรเจกต์',
        totalCount: items.length,
        items: items
          .sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || a.id.localeCompare(b.id))
          .slice(0, 6),
      }))
      .sort((a, b) => (b.totalCount ?? 0) - (a.totalCount ?? 0) || a.projectLabel.localeCompare(b.projectLabel, 'th'))
      .slice(0, 10);
    return {
      bucket,
      label: DUE_BUCKET_LABELS[bucket],
      count: list.length,
      projects,
    };
  });

  return {
    buckets: buckets.filter((b) => b.count > 0 || (options?.dueBucket && options.dueBucket === b.bucket)),
    counts,
    totalOpen: filtered.length,
  };
}

export function workSummaryStats(
  tickets: readonly Ticket[],
  people: readonly Person[],
  options?: WorkFilterOptions,
): WorkSummaryView {
  const filtered = filterWorkTickets(tickets, { ...options, people: options?.people ?? people });
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

  const trackCounts = new Map<string, number>();
  for (const ticket of filtered) {
    const label = trackDisplayLabel(ticket.track);
    trackCounts.set(label, (trackCounts.get(label) ?? 0) + 1);
  }
  const trackShare: WorkChartPoint[] = [...trackCounts.entries()]
    .map(([label, y]) => ({ x: label, y, text: `${label} ${y}` }))
    .filter((point) => point.y > 0);

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
  options?: WorkFilterOptions,
): WorkGanttTask[] {
  const names = new Map(people.map((person) => [person.id, person.nickname]));
  const visible = filterWorkTickets(tickets, { ...options, people: options?.people ?? people }).filter(
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
  options?: WorkFilterOptions,
): WorkBacklogRow[] {
  const names = new Map(people.map((person) => [person.id, person.nickname]));
  const personalAssignee = options?.assigneeId?.trim() ?? '';
  return filterWorkTickets(tickets, { ...options, people: options?.people ?? people })
    .filter((ticket) => {
      if (ticket.closed) {
        return false;
      }
      const status = workflowStatusOf(ticket);
      if (personalAssignee) {
        // Personal hub: only my assigned Backlog cards (never team unassigned queue).
        return status === 'Backlog';
      }
      return status === 'Backlog' || ticket.assigneeId === '';
    })
    .map((ticket) => ({
      id: ticket.id,
      title: ticket.title?.trim() || ticket.module || ticket.id,
      trackLabel: trackDisplayLabel(ticket.track),
      type: ticket.opType?.trim() || ticket.type,
      size: ticket.size,
      estimateMd: ticket.estimateMd,
      assignee: ticket.assigneeId ? (names.get(ticket.assigneeId) ?? ticket.assigneeId) : 'ยังไม่มีผู้รับ',
      status: workflowStatusOf(ticket),
    }));
}

export function workListRows(
  tickets: readonly Ticket[],
  people: readonly Person[],
  options?: WorkFilterOptions,
): WorkListRow[] {
  const peopleMap = peopleById(people);
  const today = options?.today ?? todayInBangkok();
  return filterWorkTickets(tickets, { ...options, people: options?.people ?? people }).map((ticket) => {
    const title = ticket.title?.trim() || ticket.module || ticket.id;
    const person = ticket.assigneeId ? peopleMap.get(ticket.assigneeId) : undefined;
    const teamId = resolvePersonTeamId(person, ticket.track);
    const sla = evaluatePolicySla(ticket, today);
    return {
      id: ticket.id,
      workLabel: `${ticket.id} · ${title}`,
      title,
      type: ticket.opType?.trim() || ticket.type,
      assignee: person?.nickname ?? (ticket.assigneeId || 'Unassigned'),
      status: workflowStatusOf(ticket),
      priorityLabel: ticket.priority?.trim() || '—',
      size: ticket.size,
      dueOnLabel: ticket.dueOn ?? ticket.firstDueOn ?? '—',
      receiptDateLabel: ticket.receiptDate ?? '—',
      alertDateLabel: ticket.alertDate ?? '—',
      policyDateLabel: ticket.policyDate ?? '—',
      replyDateLabel: ticket.replyDate ?? ticket.devDeliveredOn ?? '—',
      policySlaLabel: sla.shortLabel,
      policySlaTone: sla.tone,
      policyAuto: Boolean(ticket.slaAutoFilled?.policy),
      closedOnLabel: ticket.closedOn ?? '—',
      unplannedLabel: ticket.unplanned ? 'นอกแผน' : 'ในแผน',
      weekOffsetLabel: ticket.weekOffset === 0 ? 'ตรงสัปดาห์' : `เลื่อน +${ticket.weekOffset}`,
      track: ticket.track,
      projectLabel: resolveProjectLabel(ticket),
      teamLabel: resolveTeamLabel(teamId, person),
      teamId,
      opProject: resolveProjectKey(ticket),
    };
  });
}

function formatMd(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Adds working days (Monday-Friday) to a YYYY-MM-DD date string using pure UTC calendar math.
 * Saturdays and Sundays are skipped.
 */
export function addWorkingDays(startDateStr: string | null | undefined, daysToAdd: number): string {
  const baseStr = (startDateStr ? String(startDateStr).slice(0, 10) : todayInBangkok());
  const date = parseDay(baseStr);
  if (!date) {
    return baseStr;
  }
  const steps = Math.trunc(daysToAdd);
  if (steps <= 0) {
    return date.toISOString().slice(0, 10);
  }
  let added = 0;
  while (added < steps) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      added++;
    }
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Detects existing active WIP tickets for a person (In Progress or Reopened).
 * Excludes tickets that are already paused or the current ticket itself.
 */
export function detectActiveWipTickets(
  tickets: readonly Ticket[],
  assigneeId: string,
  excludeTicketId?: string,
): Ticket[] {
  if (!assigneeId) return [];
  return tickets.filter((t) => {
    if (t.id === excludeTicketId) return false;
    if (t.assigneeId !== assigneeId) return false;
    if (t.closed) return false;
    if (t.isPaused) return false;
    const st = workflowStatusOf(t);
    return st === 'In Progress' || st === 'Reopened';
  });
}


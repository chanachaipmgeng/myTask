import { SIZE_STANDARD_MD } from '../../../../shared/domain/scoring';
import {
  AutoSlaConfig,
  DEFAULT_AUTO_SLA_CONFIG,
  DEFAULT_AUTO_SLA_DAYS_BY_TYPE,
  DUE_PRIORITY_KEYS,
  DuePriorityKey,
  resolveTicketSlaAndDueDates,
} from '../../../../shared/domain/policy-sla';
import {
  BUG_CAUSES,
  BugCause,
  DISCIPLINES,
  Discipline,
  POC_RESULTS,
  PocResult,
  STORY_POINTS,
  Size,
  StoryPoint,
  Ticket,
  TicketType,
  Track,
  VarianceCode,
  WORK_CATEGORIES,
  WORKFLOW_STATUSES,
  WorkCategory,
  WorkflowStatus,
} from '../../../../shared/domain/models';

/** Admin-editable mapping from an OpenProject instance to the scorecard model. */
export interface OpenProjectMapping {
  /** Project identifiers to sync. Empty = every project the token can see. */
  projects: string[];
  /** OpenProject status name -> pipeline column. Matching ignores case. */
  statusMap: Record<string, WorkflowStatus>;
  /** OpenProject type name -> scorecard type. */
  typeMap: Record<string, TicketType>;
  defaultType: TicketType;
  /** Project identifier -> track. */
  projectTrack: Record<string, Track>;
  defaultTrack: Track;
  /** Work package property names like `customField3`. Empty = not used. */
  customFields: {
    size: string;
    track: string;
    type: string;
    variance: string;
    unplanned: string;
    storyPoints: string;
    discipline: string;
    workCategory: string;
    reviewRounds: string;
    blocker: string;
    dodPassed: string;
    inTimeBox: string;
    childTicketsSized: string;
    mrLink: string;
    bugCause: string;
    pocResult: string;
    /** Optional override when dueDate is not the first promised date. */
    firstDueOn: string;
    weekOffset: string;
    baselineDue: string;
    exceptionTag: string;
    rdWorkTrack: string;
    spikeOutcome: string;
    /** Case / Policy SLA date fields from myProject */
    receiptDate: string;
    replyDate: string;
    planDate: string;
    cfDueDate: string;
    alertDate: string;
    policyDate: string;
  };
  /** Count Done -> not-Done transitions from activities. One request per changed work package. */
  countReopens: boolean;
  /** Automatic working-day SLA calculation & dueOn priority fallback rules */
  autoSla: AutoSlaConfig;
}

export interface DiscoveredOpCustomField {
  key: string;
  name: string;
  type: string;
  sampleWpType?: string;
}

export const DEFAULT_OPENPROJECT_MAPPING: OpenProjectMapping = {
  projects: [],
  statusMap: {
    New: 'Backlog',
    Open: 'Backlog',
    Scheduled: 'Backlog',
    'To do': 'Backlog',
    'On Hold': 'Backlog',
    'In progress': 'In Progress',
    'Work in Progress': 'In Progress',
    'In development': 'In Progress',
    '*Request more information?': 'In Progress',
    Developed: 'Code Review',
    '*Developed': 'Ready for QA',
    'In review': 'Code Review',
    'Code review': 'Code Review',
    'Ready for QA': 'Ready for QA',
    'In testing': 'In QA',
    '*Testing in Progress': 'In QA',
    'In QA': 'In QA',
    Tested: 'In QA',
    '*Tested and Implement': 'Done',
    'Test failed': 'Reopened',
    Reopened: 'Reopened',
    Closed: 'Done',
    Done: 'Done',
    Resolved: 'Done',
    Rejected: 'Done',
    // Common Thai OpenProject status titles (lookup is case-insensitive).
    ใหม่: 'Backlog',
    'รอดำเนินการ': 'Backlog',
    'กำลังทำ': 'In Progress',
    'กำลังพัฒนา': 'In Progress',
    'รอรีวิว': 'Code Review',
    'ตรวจโค้ด': 'Code Review',
    'พร้อม QA': 'Ready for QA',
    'กำลังทดสอบ': 'In QA',
    'ทดสอบแล้ว': 'In QA',
    'ทดสอบไม่ผ่าน': 'Reopened',
    'เปิดใหม่': 'Reopened',
    ปิด: 'Done',
    'เสร็จสิ้น': 'Done',
    'ปฏิเสธ': 'Done',
  },
  typeMap: {
    Bug: 'Bug-Fix',
    'DEV-Bugs Fix': 'Bug-Fix',
    Feature: 'Feature',
    'DEV-Enhancement': 'Feature',
    'DEV-Customization': 'CR',
    'DEV-Request': 'Feature',
    'SE-Request': 'Ops',
    'CS-Service Request': 'Ops',
    'User story': 'Feature',
    Task: 'Feature',
    Epic: 'Feature',
    'Change request': 'CR',
    Spike: 'Spike',
    Research: 'Spike',
    Support: 'Ops',
  },
  defaultType: 'Feature',
  projectTrack: {},
  defaultTrack: 'Implement',
  customFields: {
    size: '',
    track: '',
    type: '',
    variance: '',
    unplanned: '',
    storyPoints: '',
    discipline: '',
    workCategory: '',
    reviewRounds: '',
    blocker: '',
    dodPassed: '',
    inTimeBox: '',
    childTicketsSized: '',
    mrLink: '',
    bugCause: '',
    pocResult: '',
    firstDueOn: '',
    weekOffset: '',
    baselineDue: '',
    exceptionTag: '',
    rdWorkTrack: '',
    spikeOutcome: '',
    receiptDate: 'customField43',
    replyDate: 'customField44',
    planDate: 'customField45',
    cfDueDate: 'customField46',
    alertDate: 'customField163',
    policyDate: 'customField185',
  },
  countReopens: true,
  autoSla: {
    enabled: DEFAULT_AUTO_SLA_CONFIG.enabled,
    alertLeadWorkingDays: DEFAULT_AUTO_SLA_CONFIG.alertLeadWorkingDays,
    daysByType: { ...DEFAULT_AUTO_SLA_CONFIG.daysByType },
    duePriorityChain: [...DEFAULT_AUTO_SLA_CONFIG.duePriorityChain],
  },
};

/** Subset of an OpenProject API v3 WorkPackage resource that we read. */
export interface OpWorkPackage {
  id: number;
  subject?: string;
  lockVersion?: number;
  estimatedTime?: string | null;
  derivedEstimatedTime?: string | null;
  spentTime?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _links?: Record<string, OpLink | OpLink[] | undefined>;
  _embedded?: { status?: { name?: string; isClosed?: boolean } } & Record<string, unknown>;
  [customField: string]: unknown;
}

export interface OpLink {
  href?: string | null;
  title?: string;
}

export interface OpActivity {
  createdAt?: string;
  comment?: { raw?: string; html?: string } | string | null;
  details?: { raw?: string; format?: string }[];
  _links?: { user?: { title?: string; href?: string } };
}

export interface MapContext {
  mapping: OpenProjectMapping;
  hoursPerMd: number;
  /** OpenProject user id -> person id. */
  personByOpUser: ReadonlyMap<number, string>;
  /** Hours from time entries per work package id. Falls back to spentTime when absent. */
  spentHours: ReadonlyMap<number, number>;
  /** The ticket already stored, to keep local-only fields and the locked first due date. */
  existing?: Ticket;
  activities?: OpActivity[];
  /** yyyy-mm-dd in Asia/Bangkok. */
  today: string;
  /** Approved shifted first due date from ticket_due_shifts, if any */
  approvedDueShift?: string | null;
}

/** Fields owned by OpenProject. Everything else on an existing ticket is kept on resync. */
export const OPENPROJECT_OWNED_FIELDS = [
  'track',
  'type',
  'module',
  'size',
  'estimateMd',
  'actualMd',
  'weekOffset',
  'closed',
  'closedOn',
  'workingDaysLeft',
  'assigneeId',
  'workflowStatus',
  'title',
  'dueOn',
  'opProject',
  'opId',
  'opParentId',
  'parentId',
  'source',
  'storyPoints',
  'discipline',
  'workCategory',
  'actualStartOn',
  'receiptDate',
  'replyDate',
  'alertDate',
  'policyDate',
  'planDate',
  'cfDueDate',
  'slaAutoFilled',
] as const;

/** ISO 8601 duration (PT8H, P1DT2H30M, PT0.5H) -> hours. OpenProject uses P1D = 24h. */
export function isoDurationToHours(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const match = /^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
    value.trim(),
  );
  if (!match) {
    return 0;
  }
  const [, w, d, h, m, s] = match.map((part) => (part === undefined ? 0 : Number(part)));
  return round2((w ?? 0) * 168 + (d ?? 0) * 24 + (h ?? 0) + (m ?? 0) / 60 + (s ?? 0) / 3600);
}

export function idFromHref(href: string | null | undefined): number | null {
  if (!href) {
    return null;
  }
  const match = /\/(\d+)\/?$/.exec(href);
  return match ? Number(match[1]) : null;
}

export function projectIdentifierFromHref(href: string | null | undefined): string {
  if (!href) {
    return '';
  }
  const match = /\/projects\/([^/]+)\/?$/.exec(href);
  return match ? decodeURIComponent(match[1]!) : '';
}

export function sizeFromEstimate(md: number): Size {
  const order: Size[] = ['XS', 'S', 'M', 'L'];
  for (const size of order) {
    if (md <= SIZE_STANDARD_MD[size] + 1e-9) {
      return size;
    }
  }
  return 'XL';
}

export function ticketIdFor(opId: number): string {
  return `OP-${opId}`;
}

/** Placeholder assignee for OpenProject users not linked to a person yet. Never matches the queue. */
export function unlinkedAssignee(opUserId: number): string {
  return `op:${opUserId}`;
}

export function mapWorkPackage(wp: OpWorkPackage, ctx: MapContext): Ticket {
  const { mapping } = ctx;
  const links = wp._links ?? {};
  const statusName = linkTitle(links['status']) || wp._embedded?.status?.name || '';
  const typeName = linkTitle(links['type']);
  const projectHref = singleLink(links['project'])?.href;
  const project = projectIdentifierFromHref(projectHref) || String(idFromHref(projectHref) ?? '');
  const projectTitle = linkTitle(links['project']);

  const workflowStatus = lookup(mapping.statusMap, statusName);
  const closed = workflowStatus === 'Done' || wp._embedded?.status?.isClosed === true;

  const estimateHours = isoDurationToHours(wp.estimatedTime ?? wp.derivedEstimatedTime);
  const spentHours = ctx.spentHours.get(wp.id) ?? isoDurationToHours(wp.spentTime);
  const estimateMd = round2(estimateHours / ctx.hoursPerMd);
  const actualMd = round2(spentHours / ctx.hoursPerMd);

  const assigneeUser = idFromHref(singleLink(links['assignee'])?.href);
  const assigneeId =
    assigneeUser === null ? '' : (ctx.personByOpUser.get(assigneeUser) ?? unlinkedAssignee(assigneeUser));
  const opParentId = idFromHref(singleLink(links['parent'])?.href);
  const parentId = opParentId !== null ? ticketIdFor(opParentId) : null;

  const cf = mapping.customFields;
  const size = asSize(customValue(wp, cf.size)) ?? sizeFromEstimate(estimateMd);
  const track =
    asTrack(customValue(wp, cf.track)) ?? mapping.projectTrack[project] ?? ctx.existing?.track ?? mapping.defaultTrack;
  const type = asType(customValue(wp, cf.type)) ?? lookup(mapping.typeMap, typeName) ?? mapping.defaultType;
  const variance = asVariance(customValue(wp, cf.variance));
  const unplanned = asBool(customValue(wp, cf.unplanned));
  const storyPoints = asStoryPoint(customValue(wp, cf.storyPoints));
  const discipline = asDiscipline(customValue(wp, cf.discipline));
  const workCategory = asWorkCategory(customValue(wp, cf.workCategory));
  const reviewRounds = asNonNegInt(customValue(wp, cf.reviewRounds));
  const blocker = asBool(customValue(wp, cf.blocker));
  const dodPassed = asBool(customValue(wp, cf.dodPassed));
  const inTimeBox = asBool(customValue(wp, cf.inTimeBox));
  const childTicketsSized = asBool(customValue(wp, cf.childTicketsSized));
  const mrLink = customValue(wp, cf.mrLink)?.trim() || null;
  const bugCause = asBugCause(customValue(wp, cf.bugCause));
  const pocResult = asPocResult(customValue(wp, cf.pocResult));
  const weekOffsetCf = asNonNegInt(customValue(wp, cf.weekOffset));
  const category = linkTitle(links['category']);

  const rawReceiptDate = dateOnly(customValue(wp, cf.receiptDate) ?? undefined);
  const rawReplyDate = dateOnly(customValue(wp, cf.replyDate) ?? undefined);
  const rawPlanDate = dateOnly(customValue(wp, cf.planDate) ?? undefined);
  const rawCfDueDate = dateOnly(customValue(wp, cf.cfDueDate) ?? undefined);
  const rawAlertDate = dateOnly(customValue(wp, cf.alertDate) ?? undefined);
  const rawPolicyDate = dateOnly(customValue(wp, cf.policyDate) ?? undefined);

  const actualStartOn = dateOnly(wp.startDate ?? undefined) ?? rawReceiptDate;
  const closedOn = closed ? (closedOnFromActivities(ctx.activities, mapping) ?? dateOnly(wp.updatedAt)) : null;

  const resolvedSla = resolveTicketSlaAndDueDates({
    wpDueDate: wp.dueDate ?? null,
    receiptDate: rawReceiptDate,
    replyDate: rawReplyDate,
    alertDate: rawAlertDate,
    policyDate: rawPolicyDate,
    planDate: rawPlanDate,
    cfDueDate: rawCfDueDate,
    startDate: actualStartOn,
    createdDate: dateOnly(wp.createdAt),
    ticketType: type,
    workflowStatus: workflowStatus || undefined,
    closed,
    closedOn,
    readyForQaAt: ctx.existing?.readyForQaAt ?? null,
    devDeliveredOn: ctx.existing?.devDeliveredOn ?? null,
    autoSla: mapping.autoSla ?? DEFAULT_AUTO_SLA_CONFIG,
  });

  const dueOn = resolvedSla.resolvedDueOn;
  const firstDueOverride = dateOnly(customValue(wp, cf.firstDueOn) ?? undefined);
  // Logic: หาก tickets.first_due_on มีค่าอยู่แล้ว ห้ามเขียนทับ ยกเว้นมีคำสั่งอนุมัติจากตาราง ticket_due_shifts
  const firstDueOn =
    ctx.approvedDueShift ||
    ctx.existing?.firstDueOn ||
    firstDueOverride ||
    dueOn;
  const reopenCount =
    ctx.activities && mapping.countReopens ? countReopens(ctx.activities, mapping) : (ctx.existing?.reopenCount ?? 0);
  // Fair cutoff: prefer Ready-for-QA / explicit Reply Date over final closedOn so QA queue does not penalize Dev.
  const deliveryAnchor =
    ctx.existing?.readyForQaAt ??
    ctx.existing?.devDeliveredOn ??
    rawReplyDate ??
    (closed ? closedOn : null);
  const computedWeekOffset = deliveryAnchor ? weekOffset(firstDueOn, deliveryAnchor) : 0;

  const base: Ticket = {
    id: ticketIdFor(wp.id),
    track,
    type,
    module: category || projectTitle || project || 'OpenProject',
    size,
    estimateMd,
    actualMd,
    weekOffset: weekOffsetCf ?? computedWeekOffset,
    reviewRounds: reviewRounds ?? 0,
    blocker: blocker ?? false,
    reopenCount,
    varianceCode: variance ?? 'NONE',
    closed,
    dodPassed: dodPassed ?? closed,
    inTimeBox: inTimeBox ?? false,
    childTicketsSized: childTicketsSized ?? false,
    unplanned: unplanned ?? false,
    assigneeId,
    closedOn,
    workingDaysLeft: closed ? null : workingDaysBetween(ctx.today, dueOn),
    note: '',
    source: 'openproject',
    opId: wp.id,
    opProject: project,
    opParentId,
    parentId,
    title: wp.subject ?? '',
    dueOn,
    firstDueOn,
    actualStartOn,
    devDeliveredOn: ctx.existing?.devDeliveredOn ?? rawReplyDate ?? undefined,
    receiptDate: resolvedSla.receiptDate,
    replyDate: resolvedSla.replyDate,
    alertDate: resolvedSla.alertDate,
    policyDate: resolvedSla.policyDate,
    planDate: resolvedSla.planDate,
    cfDueDate: resolvedSla.cfDueDate,
    slaAutoFilled: resolvedSla.slaAutoFilled,
    storyPoints: storyPoints ?? undefined,
    discipline: discipline ?? undefined,
    workCategory: workCategory ?? undefined,
    mrLink: mrLink ?? undefined,
    bugCause: bugCause ?? undefined,
    pocResult: pocResult ?? undefined,
  };
  if (workflowStatus) {
    base.workflowStatus = workflowStatus;
  }

  if (!ctx.existing) {
    return base;
  }
  // Keep fields edited in the scorecard unless a mapped custom field supplies a value.
  const merged: Ticket = { ...ctx.existing };
  const target = merged as unknown as Record<string, unknown>;
  const source = base as unknown as Record<string, unknown>;
  for (const field of OPENPROJECT_OWNED_FIELDS) {
    target[field] = source[field];
  }
  if (!workflowStatus) {
    delete merged.workflowStatus;
  }
  merged.firstDueOn = firstDueOn;
  if (!merged.devDeliveredOn && rawReplyDate) {
    merged.devDeliveredOn = rawReplyDate;
  }
  merged.reopenCount = reopenCount;
  if (variance) {
    merged.varianceCode = variance;
  }
  if (unplanned !== null) {
    merged.unplanned = unplanned;
  }
  if (reviewRounds !== null) {
    merged.reviewRounds = reviewRounds;
  }
  if (blocker !== null) {
    merged.blocker = blocker;
  }
  if (dodPassed !== null) {
    merged.dodPassed = dodPassed;
  }
  if (inTimeBox !== null) {
    merged.inTimeBox = inTimeBox;
  }
  if (childTicketsSized !== null) {
    merged.childTicketsSized = childTicketsSized;
  }
  if (mrLink) {
    merged.mrLink = mrLink;
  }
  if (bugCause) {
    merged.bugCause = bugCause;
  }
  if (pocResult) {
    merged.pocResult = pocResult;
  }
  if (weekOffsetCf !== null) {
    merged.weekOffset = weekOffsetCf;
  }
  return merged;
}

/** Parses "Status changed from X to Y" lines (plain or markdown) in activity details. */
export function statusChanges(activities: readonly OpActivity[]): { at: string; from: string; to: string }[] {
  const changes: { at: string; from: string; to: string }[] = [];
  for (const activity of activities) {
    for (const detail of activity.details ?? []) {
      const raw = (detail.raw ?? '').replace(/[*_`]/g, '');
      const match = /Status changed from (.+?) to (.+?)\s*$/i.exec(raw);
      if (match) {
        changes.push({ at: activity.createdAt ?? '', from: match[1]!.trim(), to: match[2]!.trim() });
        continue;
      }
      const set = /Status set to (.+?)\s*$/i.exec(raw);
      if (set) {
        changes.push({ at: activity.createdAt ?? '', from: '', to: set[1]!.trim() });
      }
    }
  }
  return changes;
}

export function countReopens(activities: readonly OpActivity[], mapping: OpenProjectMapping): number {
  return statusChanges(activities).filter(
    (change) => isDone(change.from, mapping) && !isDone(change.to, mapping),
  ).length;
}

function closedOnFromActivities(activities: readonly OpActivity[] | undefined, mapping: OpenProjectMapping): string | null {
  if (!activities) {
    return null;
  }
  const closes = statusChanges(activities).filter((change) => isDone(change.to, mapping) && change.at);
  const last = closes[closes.length - 1];
  return last ? dateOnly(last.at) : null;
}

function isDone(status: string, mapping: OpenProjectMapping): boolean {
  return lookup(mapping.statusMap, status) === 'Done';
}

/** Whole weeks between the Monday of the due week and the Monday of the close week. Never negative. */
export function weekOffset(dueOn: string | null | undefined, closedOn: string | null | undefined): number {
  if (!dueOn || !closedOn) {
    return 0;
  }
  const diff = mondayOf(closedOn) - mondayOf(dueOn);
  return Math.max(0, Math.round(diff / (7 * 86_400_000)));
}

/** Mon-Fri days from today (exclusive) up to due (inclusive). Negative when overdue. Null without a due date. */
export function workingDaysBetween(today: string, dueOn: string | null | undefined): number | null {
  if (!dueOn) {
    return null;
  }
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${dueOn}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  const step = end >= start ? 1 : -1;
  let days = 0;
  for (let t = start; t !== end; ) {
    t += step * 86_400_000;
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      days += step;
    }
  }
  return days;
}

function mondayOf(iso: string): number {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const weekday = (new Date(t).getUTCDay() + 6) % 7;
  return t - weekday * 86_400_000;
}

function dateOnly(iso: string | undefined): string | null {
  if (!iso) {
    return null;
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return null;
  }
  // Business dates are Bangkok time.
  return new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);
}

function singleLink(link: OpLink | OpLink[] | undefined): OpLink | undefined {
  return Array.isArray(link) ? link[0] : link;
}

function linkTitle(link: OpLink | OpLink[] | undefined): string {
  return singleLink(link)?.title?.trim() ?? '';
}

function lookup<T>(map: Record<string, T>, key: string): T | undefined {
  if (!key) {
    return undefined;
  }
  if (key in map) {
    return map[key];
  }
  const lower = key.toLowerCase();
  const hit = Object.keys(map).find((candidate) => candidate.toLowerCase() === lower);
  return hit === undefined ? undefined : map[hit];
}

/** Reads a custom field from the property (text/number/bool) or the link title (list/user types). */
export function customValue(wp: OpWorkPackage, field: string): string | null {
  if (!field) {
    return null;
  }
  const direct = wp[field];
  if (typeof direct === 'string' || typeof direct === 'number' || typeof direct === 'boolean') {
    return String(direct);
  }
  if (direct && typeof direct === 'object' && 'raw' in direct && typeof (direct as { raw: unknown }).raw === 'string') {
    return (direct as { raw: string }).raw;
  }
  const title = linkTitle(wp._links?.[field]);
  return title || null;
}

function asSize(value: string | null): Size | null {
  const upper = value?.trim().toUpperCase();
  return upper && ['XS', 'S', 'M', 'L', 'XL'].includes(upper) ? (upper as Size) : null;
}

function asTrack(value: string | null): Track | null {
  const v = value?.trim().toLowerCase();
  if (!v) {
    return null;
  }
  if (v === 'rd' || v === 'r&d' || v === 'research') {
    return 'RD';
  }
  if (v === 'implement' || v === 'implementation') {
    return 'Implement';
  }
  return null;
}

const TYPES: readonly TicketType[] = ['Feature', 'CR', 'Bug-Investigate', 'Bug-Fix', 'Spike', 'Ops', 'TechDebt'];

function asType(value: string | null): TicketType | null {
  const v = value?.trim().toLowerCase();
  return TYPES.find((type) => type.toLowerCase() === v) ?? null;
}

function asVariance(value: string | null): VarianceCode | null {
  const upper = value?.trim().toUpperCase();
  return upper && ['NONE', 'REQ', 'BLK', 'ENV', 'LEG'].includes(upper) ? (upper as VarianceCode) : null;
}

function asBool(value: string | null): boolean | null {
  const v = value?.trim().toLowerCase();
  if (!v) {
    return null;
  }
  if (['true', 'yes', '1', 'ใช่'].includes(v)) {
    return true;
  }
  if (['false', 'no', '0', 'ไม่'].includes(v)) {
    return false;
  }
  return null;
}

function asNonNegInt(value: string | null): number | null {
  if (value == null || value === '') {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.round(n);
}

function asStoryPoint(value: string | null): StoryPoint | null {
  const n = asNonNegInt(value);
  return n !== null && (STORY_POINTS as readonly number[]).includes(n) ? (n as StoryPoint) : null;
}

function asDiscipline(value: string | null): Discipline | null {
  const v = value?.trim();
  if (!v) {
    return null;
  }
  const hit = (DISCIPLINES as readonly string[]).find((d) => d.toLowerCase() === v.toLowerCase());
  return (hit as Discipline | undefined) ?? null;
}

function asWorkCategory(value: string | null): WorkCategory | null {
  const v = value?.trim();
  if (!v) {
    return null;
  }
  const hit = (WORK_CATEGORIES as readonly string[]).find((c) => c.toLowerCase() === v.toLowerCase());
  return (hit as WorkCategory | undefined) ?? null;
}

function asBugCause(value: string | null): BugCause | null {
  const v = value?.trim();
  if (!v) {
    return null;
  }
  const hit = (BUG_CAUSES as readonly string[]).find((c) => c.toLowerCase() === v.toLowerCase());
  return (hit as BugCause | undefined) ?? null;
}

function asPocResult(value: string | null): PocResult | null {
  const v = value?.trim();
  if (!v) {
    return null;
  }
  const lower = v.toLowerCase();
  if (lower === 'alternative' || lower === 'alternative chosen') {
    return 'Alternative Chosen';
  }
  const hit = (POC_RESULTS as readonly string[]).find((c) => c.toLowerCase() === lower);
  return (hit as PocResult | undefined) ?? null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isWorkflowStatus(value: string): value is WorkflowStatus {
  return (WORKFLOW_STATUSES as readonly string[]).includes(value);
}

/** Validates an admin-submitted mapping. Returns the errors, empty when valid. */
export function validateMapping(input: unknown): { mapping: OpenProjectMapping | null; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { mapping: null, errors: ['mapping must be an object'] };
  }
  const raw = input as Partial<OpenProjectMapping>;
  const rawAuto = (raw as { autoSla?: Partial<AutoSlaConfig> }).autoSla;
  const validChain: DuePriorityKey[] = Array.isArray(rawAuto?.duePriorityChain)
    ? rawAuto!.duePriorityChain.filter((k): k is DuePriorityKey =>
        (DUE_PRIORITY_KEYS as readonly string[]).includes(String(k)),
      )
    : [];
  const mergedDaysByType: Record<TicketType, number> = { ...DEFAULT_AUTO_SLA_DAYS_BY_TYPE };
  if (rawAuto?.daysByType && typeof rawAuto.daysByType === 'object') {
    for (const t of TYPES) {
      const n = Number((rawAuto.daysByType as Record<string, unknown>)[t]);
      if (Number.isFinite(n) && n >= 0 && n <= 90) {
        mergedDaysByType[t] = Math.round(n);
      }
    }
  }
  const leadRaw = Number(rawAuto?.alertLeadWorkingDays);
  const mergedAutoSla: AutoSlaConfig = {
    enabled: typeof rawAuto?.enabled === 'boolean' ? rawAuto.enabled : DEFAULT_AUTO_SLA_CONFIG.enabled,
    alertLeadWorkingDays: Number.isFinite(leadRaw) && leadRaw >= 0 && leadRaw <= 30 ? Math.round(leadRaw) : DEFAULT_AUTO_SLA_CONFIG.alertLeadWorkingDays,
    daysByType: mergedDaysByType,
    duePriorityChain: validChain.length > 0 ? Array.from(new Set(validChain)) : [...DEFAULT_AUTO_SLA_CONFIG.duePriorityChain],
  };

  const merged: OpenProjectMapping = {
    ...DEFAULT_OPENPROJECT_MAPPING,
    ...raw,
    customFields: { ...DEFAULT_OPENPROJECT_MAPPING.customFields, ...(raw.customFields ?? {}) },
    autoSla: mergedAutoSla,
  };
  if (!Array.isArray(merged.projects) || merged.projects.some((p) => typeof p !== 'string')) {
    errors.push('projects must be a list of identifiers');
  }
  for (const [name, status] of Object.entries(merged.statusMap ?? {})) {
    if (!isWorkflowStatus(String(status))) {
      errors.push(`statusMap["${name}"] = "${status}" is not one of ${WORKFLOW_STATUSES.join(', ')}`);
    }
  }
  for (const [name, type] of Object.entries(merged.typeMap ?? {})) {
    if (!TYPES.includes(type)) {
      errors.push(`typeMap["${name}"] = "${type}" is not one of ${TYPES.join(', ')}`);
    }
  }
  if (!TYPES.includes(merged.defaultType)) {
    errors.push('defaultType is invalid');
  }
  for (const [project, track] of Object.entries(merged.projectTrack ?? {})) {
    if (track !== 'Implement' && track !== 'RD') {
      errors.push(`projectTrack["${project}"] must be Implement or RD`);
    }
  }
  if (merged.defaultTrack !== 'Implement' && merged.defaultTrack !== 'RD') {
    errors.push('defaultTrack must be Implement or RD');
  }
  for (const [key, value] of Object.entries(merged.customFields)) {
    if (typeof value !== 'string' || (value !== '' && !/^customField\d+$/.test(value))) {
      errors.push(`customFields.${key} must be empty or like customField12`);
    }
  }
  return { mapping: errors.length === 0 ? merged : null, errors };
}

/**
 * Automatically suggests customField mappings by matching discovered OpenProject schema field names.
 */
export function autoMatchCustomFieldsFromSchema(
  fields: readonly DiscoveredOpCustomField[],
): Partial<OpenProjectMapping['customFields']> {
  const out: Partial<OpenProjectMapping['customFields']> = {};

  const findField = (
    predicates: ((name: string, type: string) => boolean)[],
  ): string | undefined => {
    for (const pred of predicates) {
      const hit = fields.find((f) => pred(f.name.trim().toLowerCase(), f.type.trim().toLowerCase()));
      if (hit) return hit.key;
    }
    return undefined;
  };

  const receipt = findField([
    (n, t) => t === 'date' && (n === 'receipt date' || n === 'reciept date' || n.includes('receipt') || n.includes('reciept') || n.includes('วันรับเรื่อง')),
  ]);
  if (receipt) out.receiptDate = receipt;

  const reply = findField([
    (n, t) => t === 'date' && (n === 'reply date' || n.includes('reply') || n.includes('วันตอบกลับ')),
  ]);
  if (reply) out.replyDate = reply;

  const alert = findField([
    (n, t) => t === 'date' && (n === 'alert' || n === 'alert date' || n.startsWith('alert') || n.includes('วันเตือน')),
  ]);
  if (alert) out.alertDate = alert;

  const policy = findField([
    (n, t) => t === 'date' && (n === 'policy date' || n.includes('policy') || n.includes('วันครบกำหนดตามนโยบาย')),
  ]);
  if (policy) out.policyDate = policy;

  const plan = findField([
    (n, t) => t === 'date' && (n === 'plan date' || n === 'planned date' || n.includes('วันตามแผน')),
  ]);
  if (plan) out.planDate = plan;

  const cfDue = findField([
    (n, t) => t === 'date' && (n === 'due date' || n === 'finish date'),
  ]);
  if (cfDue) out.cfDueDate = cfDue;

  const mr = findField([
    (n) => n.includes('mr link') || n.includes('merge request') || n === 'mr url',
  ]);
  if (mr) out.mrLink = mr;

  const bugCause = findField([
    (n) => n.includes('rootcause') || n.includes('bug cause') || n === 'bug type',
  ]);
  if (bugCause) out.bugCause = bugCause;

  return out;
}

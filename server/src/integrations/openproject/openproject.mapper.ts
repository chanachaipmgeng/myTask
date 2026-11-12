import { SIZE_STANDARD_MD } from '../../../../shared/domain/scoring';
import {
  Size,
  Ticket,
  TicketType,
  Track,
  VarianceCode,
  WORKFLOW_STATUSES,
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
  };
  /** Count Done -> not-Done transitions from activities. One request per changed work package. */
  countReopens: boolean;
}

export const DEFAULT_OPENPROJECT_MAPPING: OpenProjectMapping = {
  projects: [],
  statusMap: {
    New: 'Backlog',
    Scheduled: 'Backlog',
    'To do': 'Backlog',
    'In progress': 'In Progress',
    'In development': 'In Progress',
    Developed: 'Code Review',
    'In review': 'Code Review',
    'Code review': 'Code Review',
    'Ready for QA': 'Ready for QA',
    'In testing': 'In QA',
    'In QA': 'In QA',
    Tested: 'In QA',
    'Test failed': 'Reopened',
    Reopened: 'Reopened',
    Closed: 'Done',
    Done: 'Done',
    Resolved: 'Done',
    Rejected: 'Done',
  },
  typeMap: {
    Bug: 'Bug-Fix',
    Feature: 'Feature',
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
  customFields: { size: '', track: '', type: '', variance: '', unplanned: '', storyPoints: '', discipline: '' },
  countReopens: true,
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
  details?: { raw?: string; format?: string }[];
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
  'source',
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

  const cf = mapping.customFields;
  const size = asSize(customValue(wp, cf.size)) ?? sizeFromEstimate(estimateMd);
  const track =
    asTrack(customValue(wp, cf.track)) ?? mapping.projectTrack[project] ?? ctx.existing?.track ?? mapping.defaultTrack;
  const type = asType(customValue(wp, cf.type)) ?? lookup(mapping.typeMap, typeName) ?? mapping.defaultType;
  const variance = asVariance(customValue(wp, cf.variance));
  const unplanned = asBool(customValue(wp, cf.unplanned));
  const category = linkTitle(links['category']);

  const dueOn = wp.dueDate ?? null;
  const firstDueOn = ctx.existing?.firstDueOn ?? dueOn;
  const closedOn = closed ? (closedOnFromActivities(ctx.activities, mapping) ?? dateOnly(wp.updatedAt)) : null;
  const reopenCount =
    ctx.activities && mapping.countReopens ? countReopens(ctx.activities, mapping) : (ctx.existing?.reopenCount ?? 0);

  const base: Ticket = {
    id: ticketIdFor(wp.id),
    track,
    type,
    module: category || projectTitle || project || 'OpenProject',
    size,
    estimateMd,
    actualMd,
    weekOffset: closed ? weekOffset(firstDueOn, closedOn) : 0,
    reviewRounds: 0,
    blocker: false,
    reopenCount,
    varianceCode: variance ?? 'NONE',
    closed,
    dodPassed: closed,
    inTimeBox: false,
    childTicketsSized: false,
    unplanned: unplanned ?? false,
    assigneeId,
    closedOn,
    workingDaysLeft: closed ? null : workingDaysBetween(ctx.today, dueOn),
    note: '',
    source: 'openproject',
    opId: wp.id,
    opProject: project,
    title: wp.subject ?? '',
    dueOn,
    firstDueOn,
  };
  if (workflowStatus) {
    base.workflowStatus = workflowStatus;
  }

  if (!ctx.existing) {
    return base;
  }
  // Keep fields edited in the scorecard (review rounds, DoD, notes, MR link...). Overwrite the OpenProject-owned ones.
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
  merged.reopenCount = reopenCount;
  if (variance) {
    merged.varianceCode = variance;
  }
  if (unplanned !== null) {
    merged.unplanned = unplanned;
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
  const merged: OpenProjectMapping = {
    ...DEFAULT_OPENPROJECT_MAPPING,
    ...raw,
    customFields: { ...DEFAULT_OPENPROJECT_MAPPING.customFields, ...(raw.customFields ?? {}) },
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

import { Ticket, TicketType, WorkflowStatus } from './models';

export const DUE_PRIORITY_KEYS = ['dueDate', 'cfDueDate', 'policyDate', 'planDate'] as const;
export type DuePriorityKey = (typeof DUE_PRIORITY_KEYS)[number];

export interface TicketSlaAutoFlags {
  receipt?: boolean;
  alert?: boolean;
  policy?: boolean;
  reply?: boolean;
}

export interface AutoSlaConfig {
  enabled: boolean;
  /** Number of working days before Policy Date to set Alert Date when empty */
  alertLeadWorkingDays: number;
  /** Working days added to Receipt Date per TicketType when Policy Date is empty */
  daysByType: Record<TicketType, number>;
  /** Priority order for resolving Ticket.dueOn / initial firstDueOn */
  duePriorityChain: DuePriorityKey[];
}

export const DEFAULT_AUTO_SLA_DAYS_BY_TYPE: Record<TicketType, number> = {
  'Bug-Investigate': 2,
  'Bug-Fix': 3,
  Ops: 2,
  Spike: 3,
  Feature: 5,
  CR: 5,
  TechDebt: 5,
};

export const DEFAULT_AUTO_SLA_CONFIG: AutoSlaConfig = {
  enabled: true,
  alertLeadWorkingDays: 1,
  daysByType: { ...DEFAULT_AUTO_SLA_DAYS_BY_TYPE },
  duePriorityChain: ['dueDate', 'cfDueDate', 'policyDate', 'planDate'],
};

export type PolicySlaState =
  | 'none'
  | 'on-track'
  | 'alert-due'
  | 'breached'
  | 'replied-on-time'
  | 'replied-late';

export interface PolicySlaEvaluation {
  state: PolicySlaState;
  label: string;
  shortLabel: string;
  tone: 'secondary' | 'teal' | 'warning' | 'danger' | 'success';
}

export function normalizeIsoDateOnly(raw: string | Date | null | undefined): string | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
  }
  const trimmed = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Shifts an ISO YYYY-MM-DD date by delta working days (Mon-Fri), skipping weekends. */
export function shiftWorkingDays(isoDate: string, deltaWorkingDays: number): string {
  const clean = isoDate.slice(0, 10);
  const startMs = Date.parse(`${clean}T00:00:00Z`);
  if (Number.isNaN(startMs)) return clean;

  const cur = new Date(startMs);
  // If starting on Saturday/Sunday and delta === 0, snap forward to Monday for positive/zero or Friday for negative
  if (deltaWorkingDays === 0) {
    const wd = cur.getUTCDay();
    if (wd === 6) cur.setUTCDate(cur.getUTCDate() + 2);
    else if (wd === 0) cur.setUTCDate(cur.getUTCDate() + 1);
    return cur.toISOString().slice(0, 10);
  }

  const step = deltaWorkingDays > 0 ? 1 : -1;
  let remaining = Math.abs(Math.trunc(deltaWorkingDays));
  while (remaining > 0) {
    cur.setUTCDate(cur.getUTCDate() + step);
    const wd = cur.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      remaining -= 1;
    }
  }
  return cur.toISOString().slice(0, 10);
}

export interface ResolveSlaDatesInput {
  wpDueDate?: string | null;
  receiptDate?: string | null;
  replyDate?: string | null;
  alertDate?: string | null;
  policyDate?: string | null;
  planDate?: string | null;
  cfDueDate?: string | null;
  startDate?: string | null;
  createdDate?: string | null;
  ticketType: TicketType;
  workflowStatus?: WorkflowStatus;
  closed: boolean;
  closedOn?: string | null;
  readyForQaAt?: string | null;
  devDeliveredOn?: string | null;
  autoSla?: AutoSlaConfig | null;
}

export interface ResolvedSlaDatesResult {
  receiptDate: string | null;
  replyDate: string | null;
  alertDate: string | null;
  policyDate: string | null;
  planDate: string | null;
  cfDueDate: string | null;
  slaAutoFilled?: TicketSlaAutoFlags;
  resolvedDueOn: string | null;
}

export function resolveTicketSlaAndDueDates(input: ResolveSlaDatesInput): ResolvedSlaDatesResult {
  const cfg = input.autoSla ?? DEFAULT_AUTO_SLA_CONFIG;
  let receiptDate = normalizeIsoDateOnly(input.receiptDate);
  let replyDate = normalizeIsoDateOnly(input.replyDate);
  let alertDate = normalizeIsoDateOnly(input.alertDate);
  let policyDate = normalizeIsoDateOnly(input.policyDate);
  const planDate = normalizeIsoDateOnly(input.planDate);
  const cfDueDate = normalizeIsoDateOnly(input.cfDueDate);
  const wpDueDate = normalizeIsoDateOnly(input.wpDueDate);

  const flags: TicketSlaAutoFlags = {};

  if (cfg.enabled) {
    if (!receiptDate) {
      const fallbackStart = normalizeIsoDateOnly(input.startDate) ?? normalizeIsoDateOnly(input.createdDate);
      if (fallbackStart) {
        receiptDate = fallbackStart;
        flags.receipt = true;
      }
    }

    if (!policyDate && receiptDate) {
      const addDays = cfg.daysByType?.[input.ticketType] ?? DEFAULT_AUTO_SLA_DAYS_BY_TYPE[input.ticketType] ?? 5;
      policyDate = shiftWorkingDays(receiptDate, Math.max(0, addDays));
      flags.policy = true;
    }

    if (!alertDate && policyDate) {
      const lead = Math.max(0, cfg.alertLeadWorkingDays ?? 1);
      alertDate = shiftWorkingDays(policyDate, -lead);
      flags.alert = true;
    }

    if (!replyDate) {
      const delivered =
        normalizeIsoDateOnly(input.readyForQaAt) ??
        normalizeIsoDateOnly(input.devDeliveredOn) ??
        (input.closed ? normalizeIsoDateOnly(input.closedOn) : null);
      if (delivered) {
        replyDate = delivered;
        flags.reply = true;
      }
    }
  }

  const chain = cfg.duePriorityChain?.length ? cfg.duePriorityChain : DEFAULT_AUTO_SLA_CONFIG.duePriorityChain;
  const candidateMap: Record<DuePriorityKey, string | null> = {
    dueDate: wpDueDate,
    cfDueDate,
    policyDate,
    planDate,
  };

  let resolvedDueOn: string | null = null;
  for (const key of chain) {
    const val = candidateMap[key];
    if (val) {
      resolvedDueOn = val;
      break;
    }
  }

  const hasAuto = Boolean(flags.receipt || flags.alert || flags.policy || flags.reply);
  return {
    receiptDate,
    replyDate,
    alertDate,
    policyDate,
    planDate,
    cfDueDate,
    slaAutoFilled: hasAuto ? flags : undefined,
    resolvedDueOn,
  };
}

export function evaluatePolicySla(
  ticket: Pick<
    Ticket,
    | 'policyDate'
    | 'alertDate'
    | 'replyDate'
    | 'dueOn'
    | 'closed'
    | 'closedOn'
    | 'readyForQaAt'
    | 'devDeliveredOn'
  >,
  todayIso: string,
): PolicySlaEvaluation {
  const today = todayIso.slice(0, 10);
  const policy = normalizeIsoDateOnly(ticket.policyDate);
  const alert = normalizeIsoDateOnly(ticket.alertDate);
  const reply =
    normalizeIsoDateOnly(ticket.replyDate) ??
    normalizeIsoDateOnly(ticket.readyForQaAt) ??
    normalizeIsoDateOnly(ticket.devDeliveredOn) ??
    (ticket.closed ? normalizeIsoDateOnly(ticket.closedOn) : null);

  if (!policy && !alert) {
    return { state: 'none', label: '—', shortLabel: '—', tone: 'secondary' };
  }

  if (reply) {
    if (!policy || reply <= policy) {
      return {
        state: 'replied-on-time',
        label: 'ทัน Policy SLA',
        shortLabel: 'ทัน SLA',
        tone: 'success',
      };
    }
    return {
      state: 'replied-late',
      label: 'ตอบช้ากว่า Policy',
      shortLabel: 'ช้ากว่า SLA',
      tone: 'warning',
    };
  }

  if (ticket.closed) {
    return {
      state: 'replied-on-time',
      label: 'ปิดงานแล้ว',
      shortLabel: 'ปิดแล้ว',
      tone: 'success',
    };
  }

  if (policy && today > policy) {
    return {
      state: 'breached',
      label: `เกิน Policy (${policy})`,
      shortLabel: 'เกิน Policy',
      tone: 'danger',
    };
  }

  if ((alert && today >= alert) || (policy && today === policy)) {
    return {
      state: 'alert-due',
      label: `ถึงวันเตือน SLA (${policy ?? alert})`,
      shortLabel: 'เตือน Alert SLA',
      tone: 'warning',
    };
  }

  return {
    state: 'on-track',
    label: `ตามเกณฑ์ (${policy ?? alert})`,
    shortLabel: 'ตามเกณฑ์ SLA',
    tone: 'teal',
  };
}

import {
  ChartPoint,
  Level,
  Person,
  Size,
  Ticket,
  TicketType,
  Track,
  VarianceCode,
  WorkloadCategory,
} from './models';
import { RubricDefinition, SizingRubricParams, getRubricOrDefault } from './rubrics';

export interface ScoreTicketOptions {
  rubrics?: Record<string, RubricDefinition>;
  blockedHours?: number;
  qaWaitHours?: number;
  hoursPerMd?: number;
}

export const FOCUS_HOURS_PER_MD = 6;
export const INDEX_TARGET = 75;
export const PLAN_TARGET = 80;
export const REWORK_TARGET = 0.1;
export const UNPLANNED_TARGET = 0.25;
export const UNPLANNED_DENOMINATOR = 5;
export const SPIKE_RATIO_MIN = 0.15;
export const SPIKE_RATIO_MAX = 0.4;

export const WEEKLY_QUOTA: Record<Level, number> = {
  Senior: 3.5,
  Mid: 4,
  Junior: 3,
  FirstMonth: 2,
};

export interface TrackWeights {
  implement: { ticket: number; plan: number; accuracy: number; quality: number };
  research: { dod: number; spike: number; outcome: number; review: number };
}

export const DEFAULT_TRACK_WEIGHTS: TrackWeights = {
  implement: { ticket: 0.5, plan: 0.2, accuracy: 0.15, quality: 0.15 },
  research: { dod: 0.4, spike: 0.25, outcome: 0.2, review: 0.15 },
};

export const SIZE_POINTS: Record<Size, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8,
};

export const SIZE_STANDARD_MD: Record<Size, number> = {
  XS: 0.25,
  S: 0.5,
  M: 1,
  L: 2,
  XL: 3,
};

const WORKLOAD_CATEGORY: Record<TicketType, WorkloadCategory> = {
  Feature: 'Enhancement',
  CR: 'Customization',
  'Bug-Investigate': 'Bug',
  'Bug-Fix': 'Bug',
  Spike: 'Spike',
  Ops: 'Request',
  TechDebt: 'TechDebt',
};

const CATEGORY_ORDER: readonly WorkloadCategory[] = [
  'Bug',
  'Customization',
  'Enhancement',
  'Request',
  'Spike',
  'TechDebt',
];

const EXEMPT_VARIANCE: ReadonlySet<VarianceCode> = new Set(['REQ', 'BLK', 'ENV']);

export interface TicketScore {
  total: number | null;
  week: number;
  accuracy: number;
  review: number;
  reopen: number;
  ratio: number | null;
  accuracyInBand: boolean;
  exempt: boolean;
  spikeScore: number | null;
  points: number;
  category: WorkloadCategory;
}

export interface PersonScore {
  personId: string;
  closedCount: number;
  closedMd: number;
  plannedMd: number;
  planRawPct: number;
  planIndexPct: number;
  weightedScore: number;
  accuracyShare: number;
  reworkRate: number;
  quality: number;
  unplannedMd: number;
  unplannedRatio: number;
  dodWeightedScore: number;
  spikeQuality: number;
  spikeMd: number;
  spikeRatio: number;
  spikeInBand: boolean;
  acceptedOutcomeMd: number;
  plannedOutcomeMd: number;
  outcomeRawPct: number;
  outcomeIndexPct: number;
  reviewReopenQuality: number;
  developmentIndex: number;
}

export function workloadCategory(type: TicketType): WorkloadCategory {
  return WORKLOAD_CATEGORY[type];
}

export function isExemptVariance(code: VarianceCode): boolean {
  return EXEMPT_VARIANCE.has(code);
}

export function isLegalSpikeTimeBox(estimateMd: number): boolean {
  const rounded = Math.round(estimateMd * 100) / 100;
  return rounded === 0.5 || rounded === 1;
}

function roundRatio(actualMd: number, estimateMd: number): number {
  return Math.round((actualMd / estimateMd) * 10000) / 10000;
}

/**
 * Tiered Tolerance Accuracy Band based on Ticket Size:
 * - XS (<= 0.25 MD) & S (<= 0.5 MD): Broader tolerance [0.5, 2.0] full points, [0.3, 2.5] partial points
 *   (small tasks have higher natural variance in time tracking).
 * - M (1.0 MD): Standard tolerance [0.8, 1.5] full points, [0.5, 2.0] partial points.
 * - L (2.0 MD) & XL (3.0+ MD): Tighter tolerance [0.85, 1.3] full points, [0.7, 1.6] partial points
 *   (larger tasks require stricter delivery discipline).
 */
export function accuracyBand(ratio: number, size?: Size, rubrics?: Record<string, RubricDefinition>): { points: number; inBand: boolean } {
  if (rubrics) {
    const rubricId =
      size === 'XS'
        ? 'RUB-SIZE-XS'
        : size === 'S'
          ? 'RUB-SIZE-S'
          : size === 'L'
            ? 'RUB-SIZE-L'
            : size === 'XL'
              ? 'RUB-SIZE-XL'
              : 'RUB-SIZE-M';
    try {
      const rubric = getRubricOrDefault<SizingRubricParams>(rubricId, rubrics);
      if (rubric.is_active !== false) {
        const minRatio = rubric.params.min_ratio ?? 0.8;
        const maxRatio = rubric.params.max_ratio ?? 1.5;
        const defaultFull =
          size === 'XS' || size === 'S'
            ? [0.5, 2.0]
            : size === 'L' || size === 'XL'
              ? [0.85, 1.3]
              : [0.8, 1.5];
        const defaultPartial =
          size === 'XS' || size === 'S'
            ? [0.3, 2.5]
            : size === 'L' || size === 'XL'
              ? [0.7, 1.6]
              : [0.5, 2.0];
        const matchesDefault = minRatio === defaultFull[0] && maxRatio === defaultFull[1];
        if (ratio >= minRatio && ratio <= maxRatio) {
          return { points: 20, inBand: true };
        }
        const partialMin = matchesDefault ? defaultPartial[0] : Math.max(0, minRatio - 0.3);
        const partialMax = matchesDefault ? defaultPartial[1] : maxRatio + 0.5;
        if ((ratio >= partialMin && ratio < minRatio) || (ratio > maxRatio && ratio <= partialMax)) {
          return { points: 10, inBand: false };
        }
        return { points: 0, inBand: false };
      }
    } catch {
      // Fall through to hardcoded bands when rubric id missing.
    }
  }

  if (size === 'XS' || size === 'S') {
    if (ratio >= 0.5 && ratio <= 2.0) {
      return { points: 20, inBand: true };
    }
    if ((ratio >= 0.3 && ratio < 0.5) || (ratio > 2.0 && ratio <= 2.5)) {
      return { points: 10, inBand: false };
    }
    return { points: 0, inBand: false };
  }

  if (size === 'L' || size === 'XL') {
    if (ratio >= 0.85 && ratio <= 1.3) {
      return { points: 20, inBand: true };
    }
    if ((ratio >= 0.7 && ratio < 0.85) || (ratio > 1.3 && ratio <= 1.6)) {
      return { points: 10, inBand: false };
    }
    return { points: 0, inBand: false };
  }

  // Default / M size
  if (ratio >= 0.8 && ratio <= 1.5) {
    return { points: 20, inBand: true };
  }
  if ((ratio >= 0.5 && ratio < 0.8) || (ratio > 1.5 && ratio <= 2.0)) {
    return { points: 10, inBand: false };
  }
  return { points: 0, inBand: false };
}

function weekPoints(weekOffset: number): number {
  if (weekOffset <= 0) {
    return 40;
  }
  if (weekOffset === 1) {
    return 20;
  }
  return 0;
}

function reviewPoints(reviewRounds: number, blocker: boolean): number {
  if (reviewRounds <= 2 && !blocker) {
    return 20;
  }
  if (reviewRounds === 3) {
    return 10;
  }
  return 0;
}

function reopenPoints(reopenCount: number): number {
  if (reopenCount <= 0) {
    return 20;
  }
  if (reopenCount === 1) {
    return 10;
  }
  return 0;
}

export function scoreTicket(ticket: Ticket, options?: ScoreTicketOptions): TicketScore {
  const points = SIZE_POINTS[ticket.size];
  const category = workloadCategory(ticket.type);
  const exempt = isExemptVariance(ticket.varianceCode) || (ticket.pausedDays != null && ticket.pausedDays > 0 && ticket.isPaused === false);
  const spikeScore = spikeQualityScore(ticket);

  if (!ticket.closed) {
    return {
      total: null,
      week: 0,
      accuracy: 0,
      review: 0,
      reopen: 0,
      ratio: null,
      accuracyInBand: false,
      exempt,
      spikeScore,
      points,
      category,
    };
  }

  let week = weekPoints(ticket.weekOffset);
  let ratio: number | null = null;
  let accuracy = 0;
  let accuracyInBand = false;

  // Net Actual MD: deduct paused days, blocked delays, and QA waiting time.
  const effectiveActualMd = calculateNetActualMd(
    ticket,
    options?.blockedHours ?? 0,
    options?.qaWaitHours ?? 0,
    options?.hoursPerMd ?? FOCUS_HOURS_PER_MD,
  );

  if (ticket.estimateMd <= 0) {
    accuracy = 0;
    ratio = null;
  } else {
    ratio = roundRatio(effectiveActualMd, ticket.estimateMd);
    const band = accuracyBand(ratio, ticket.size, options?.rubrics);
    accuracy = band.points;
    accuracyInBand = band.inBand;
  }

  if (exempt) {
    week = 40;
    accuracy = 20;
  }

  const review = reviewPoints(ticket.reviewRounds, ticket.blocker);
  const reopen = reopenPoints(ticket.reopenCount);

  return {
    total: week + accuracy + review + reopen,
    week,
    accuracy,
    review,
    reopen,
    ratio,
    accuracyInBand,
    exempt,
    spikeScore,
    points,
    category,
  };
}

/** 100 when a closed spike stays inside a 0.5 or 1 MD time-box and its children are sized. */
export function spikeQualityScore(ticket: Ticket): number | null {
  if (ticket.type !== 'Spike') {
    return null;
  }
  if (
    ticket.closed &&
    isLegalSpikeTimeBox(ticket.estimateMd) &&
    ticket.inTimeBox &&
    ticket.childTicketsSized
  ) {
    return 100;
  }
  return 0;
}

function closedTickets(tickets: readonly Ticket[]): Ticket[] {
  return tickets.filter((ticket) => ticket.closed);
}

function weighted(
  tickets: readonly Ticket[],
  include: (ticket: Ticket) => boolean,
  options?: ScoreTicketOptions,
): number {
  let weightedPoints = 0;
  let points = 0;
  for (const ticket of tickets) {
    if (!include(ticket)) {
      continue;
    }
    const score = scoreTicket(ticket, options);
    if (score.total === null) {
      continue;
    }
    weightedPoints += score.total * score.points;
    points += score.points;
  }
  return points === 0 ? 0 : weightedPoints / points;
}

function effortMd(ticket: Ticket): number {
  return ticket.closed ? ticket.actualMd : ticket.estimateMd;
}

export function scorePerson(
  person: Person,
  tickets: readonly Ticket[],
  weights: TrackWeights = DEFAULT_TRACK_WEIGHTS,
  options?: ScoreTicketOptions,
): PersonScore {
  const assigned = tickets.filter((ticket) => ticket.assigneeId === person.id && !ticket.isSplitEffort);
  const splitTickets = tickets.filter(
    (ticket) =>
      ticket.isSplitEffort &&
      (ticket.allocations ?? []).some((alloc) => alloc.userId === person.id),
  );
  const own = [...assigned, ...splitTickets.filter((t) => !assigned.some((a) => a.id === t.id))];
  const closed = closedTickets(own);
  const splitClosedMd = splitTickets
    .filter((t) => t.closed)
    .reduce((sum, ticket) => {
      const alloc = (ticket.allocations ?? []).find((a) => a.userId === person.id);
      return sum + (alloc?.actualMd ?? 0);
    }, 0);
  const assignedClosedMd = closed
    .filter((t) => !t.isSplitEffort)
    .reduce((sum, ticket) => sum + ticket.actualMd, 0);
  const peerReviewMd = tickets
    .filter(
      (ticket) =>
        ticket.reviewerId === person.id ||
        (ticket.reviewers ?? []).includes(person.id) ||
        (ticket.approvedBy ?? []).includes(person.id),
    )
    .reduce((sum, ticket) => sum + (ticket.peerReviewCreditMd ?? calculateReviewerCredit(ticket)), 0);
  const qaCreditMd = tickets
    .filter((ticket) => ticket.qaAssigneeId === person.id)
    .reduce((sum, ticket) => sum + calculateQaCredit(ticket), 0);
  const closedMd = roundMd(assignedClosedMd + splitClosedMd + peerReviewMd + qaCreditMd);
  const plannedMd = person.plannedMd;
  const planRawPct = plannedMd === 0 ? 0 : (closedMd / plannedMd) * 100;
  const planIndexPct = Math.min(planRawPct, 100);
  const weightedScore = weighted(closed, () => true, options);
  const inBand = closed.filter((ticket) => scoreTicket(ticket, options).accuracyInBand).length;
  const accuracyShare = closed.length === 0 ? 0 : inBand / closed.length;
  const reopened = closed.filter((ticket) => ticket.reopenCount > 0).length;
  const reworkRate = closed.length === 0 ? 0 : reopened / closed.length;
  const quality = closed.length === 0 ? 0 : 1 - reworkRate;
  const unplannedMd = own.reduce((sum, ticket) => {
    if (!ticket.unplanned) {
      return sum;
    }
    return sum + effortMd(ticket);
  }, 0);
  const unplannedRatio = unplannedMd / UNPLANNED_DENOMINATOR;
  const dodWeightedScore = weighted(
    closed,
    (ticket) => (ticket.type === 'Feature' || ticket.type === 'CR') && ticket.dodPassed,
    options,
  );
  const spikes = own.filter((ticket) => ticket.type === 'Spike');
  const spikeQuality =
    spikes.length === 0
      ? 0
      : spikes.reduce((sum, ticket) => sum + (spikeQualityScore(ticket) ?? 0), 0) / spikes.length;
  const spikeMd = spikes.reduce((sum, ticket) => sum + ticket.estimateMd, 0);
  const spikeRatio = plannedMd === 0 ? 0 : spikeMd / plannedMd;
  const spikeInBand = spikeRatio >= SPIKE_RATIO_MIN && spikeRatio <= SPIKE_RATIO_MAX;
  const outcomes = own.filter((ticket) => ticket.type === 'Feature' || ticket.type === 'CR');
  const plannedOutcomeMd = outcomes.reduce((sum, ticket) => sum + ticket.estimateMd, 0);
  const acceptedOutcomeMd = outcomes
    .filter((ticket) => ticket.closed && ticket.dodPassed)
    .reduce((sum, ticket) => sum + ticket.actualMd, 0);
  const outcomeRawPct = plannedOutcomeMd === 0 ? 0 : (acceptedOutcomeMd / plannedOutcomeMd) * 100;
  const outcomeIndexPct = Math.min(outcomeRawPct, 100);

  let reviewWeighted = 0;
  let reviewPointsTotal = 0;
  for (const ticket of closed) {
    const score = scoreTicket(ticket, options);
    reviewWeighted += (score.review + score.reopen) * score.points;
    reviewPointsTotal += score.points;
  }
  const reviewReopenQuality =
    reviewPointsTotal === 0 ? 0 : (reviewWeighted / reviewPointsTotal / 40) * 100;

  const implementIndex =
    weights.implement.ticket * weightedScore +
    weights.implement.plan * planIndexPct +
    weights.implement.accuracy * (accuracyShare * 100) +
    weights.implement.quality * (quality * 100);
  const researchIndex =
    weights.research.dod * dodWeightedScore +
    weights.research.spike * spikeQuality +
    weights.research.outcome * outcomeIndexPct +
    weights.research.review * reviewReopenQuality;

  // Track Formulas for 6 Core Tracks
  const qaIndex =
    0.4 * (weightedScore > 0 ? weightedScore : 90) +
    0.3 * 92 +
    0.2 * 100 +
    0.1 * (dodWeightedScore > 0 ? dodWeightedScore : 95);

  const uxbaIndex =
    0.4 * (accuracyShare > 0 ? accuracyShare * 100 : 88) +
    0.3 * 95 +
    0.2 * (quality > 0 ? quality * 100 : 90) +
    0.1 * planIndexPct;

  const supIndex =
    0.45 * (weightedScore > 0 ? weightedScore : 92) +
    0.25 * 94 +
    0.15 * (quality > 0 ? quality * 100 : 90) +
    0.15 * (accuracyShare > 0 ? accuracyShare * 100 : 85);

  const infraIndex =
    0.4 * (weightedScore > 0 ? weightedScore : 95) +
    0.25 * (quality > 0 ? quality * 100 : 92) +
    0.2 * 90 +
    0.15 * planIndexPct;

  let developmentIndex = implementIndex;
  if (person.track === 'RD' || person.track === 'RND') {
    developmentIndex = researchIndex;
  } else if (person.track === 'Implement' || person.track === 'IMP') {
    developmentIndex = implementIndex;
  } else if (person.track === 'QA') {
    developmentIndex = qaIndex;
  } else if (person.track === 'UXBA') {
    developmentIndex = uxbaIndex;
  } else if (person.track === 'SUP') {
    developmentIndex = supIndex;
  } else if (person.track === 'INFRA') {
    developmentIndex = infraIndex;
  }

  return {
    personId: person.id,
    closedCount: closed.length,
    closedMd,
    plannedMd,
    planRawPct,
    planIndexPct,
    weightedScore,
    accuracyShare,
    reworkRate,
    quality,
    unplannedMd,
    unplannedRatio,
    dodWeightedScore,
    spikeQuality,
    spikeMd,
    spikeRatio,
    spikeInBand,
    acceptedOutcomeMd,
    plannedOutcomeMd,
    outcomeRawPct,
    outcomeIndexPct,
    reviewReopenQuality,
    developmentIndex,
  };
}

/** Calculates net weekly quota adjusted dynamically by leave days and public holidays. */
export function calculateNetWeeklyQuota(
  baseQuota: number,
  leaveDays: number = 0,
  publicHolidays: number = 0,
): number {
  const workingDays = Math.max(0, 5 - leaveDays - publicHolidays);
  return roundMd(baseQuota * (workingDays / 5));
}

/** Calculates 10-15% credit for code reviewer (Peer Review MD) awarded to seniors */
export function calculateReviewerCredit(ticket: Ticket, pct = 0.1): number {
  const effectivePct = Math.min(0.15, Math.max(0.1, pct));
  return roundMd(ticket.estimateMd * effectivePct);
}

/**
 * Calculates net Actual MD after deducting paused days, blocked delays, and QA waiting time.
 */
export function calculateNetActualMd(ticket: Ticket, blockedHours = 0, qaWaitHours = 0, hoursPerMd = 6): number {
  const pausedMd = ticket.pausedDays || 0;
  const blockedMd = blockedHours > 0 ? blockedHours / hoursPerMd : 0;
  const qaWaitMd = qaWaitHours > 0 ? qaWaitHours / hoursPerMd : 0;
  const net = Math.max(0, ticket.actualMd - pausedMd - blockedMd - qaWaitMd);
  return roundMd(net);
}

/** Calculates QA execution credit (qaEstimatedMd or 15-20% of estimateMd) */
export function calculateQaCredit(ticket: Ticket): number {
  return ticket.qaEstimatedMd && ticket.qaEstimatedMd > 0
    ? ticket.qaEstimatedMd
    : roundMd(ticket.estimateMd * 0.15);
}

export function sampleWorkloadPoints(tickets: readonly Ticket[], track: Track | 'All'): ChartPoint[] {
  const rows = track === 'All' ? tickets : tickets.filter((ticket) => ticket.track === track);
  const points: ChartPoint[] = [];

  if (track === 'All') {
    for (const category of CATEGORY_ORDER) {
      for (const side of ['RD', 'Implement'] as const) {
        const value = roundMd(
          rows
            .filter((ticket) => ticket.track === side && workloadCategory(ticket.type) === category)
            .reduce((sum, ticket) => sum + effortMd(ticket), 0),
        );
        if (value > 0) {
          const label = `${category} · ${side === 'RD' ? 'R&D' : 'Implement'}`;
          points.push({ x: label, y: value, text: `${formatMd(value)} MD` });
        }
      }
    }
    return points;
  }

  for (const category of CATEGORY_ORDER) {
    const value = roundMd(
      rows
        .filter((ticket) => workloadCategory(ticket.type) === category)
        .reduce((sum, ticket) => sum + effortMd(ticket), 0),
    );
    if (value > 0) {
      points.push({ x: category, y: value, text: `${formatMd(value)} MD` });
    }
  }
  return points;
}

export function roundMd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatMd(value: number): string {
  const rounded = roundMd(value);
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatPercent(value: number, digits = 1): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Calculates total and percentage share of MD-DIRECT tickets in given ticket list.
 */
export function calculateMdMandateShare(tickets: readonly Ticket[]): {
  totalTickets: number;
  mdDirectCount: number;
  totalMd: number;
  mdDirectMd: number;
  mdDirectSharePct: number;
} {
  const mdTickets = tickets.filter((t) => t.isMdDirect);
  const totalMd = roundMd(tickets.reduce((sum, t) => sum + effortMd(t), 0));
  const mdDirectMd = roundMd(mdTickets.reduce((sum, t) => sum + effortMd(t), 0));
  const mdDirectSharePct = totalMd > 0 ? roundMd((mdDirectMd / totalMd) * 100) : 0;

  return {
    totalTickets: tickets.length,
    mdDirectCount: mdTickets.length,
    totalMd,
    mdDirectMd,
    mdDirectSharePct,
  };
}

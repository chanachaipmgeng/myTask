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

function accuracyBand(ratio: number): { points: number; inBand: boolean } {
  if (ratio >= 0.8 && ratio <= 1.5) {
    return { points: 20, inBand: true };
  }
  if ((ratio >= 0.5 && ratio < 0.8) || (ratio > 1.5 && ratio <= 2)) {
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

export function scoreTicket(ticket: Ticket): TicketScore {
  const points = SIZE_POINTS[ticket.size];
  const category = workloadCategory(ticket.type);
  const exempt = isExemptVariance(ticket.varianceCode);
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

  if (ticket.estimateMd <= 0) {
    accuracy = 0;
    ratio = null;
  } else {
    ratio = roundRatio(ticket.actualMd, ticket.estimateMd);
    const band = accuracyBand(ratio);
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

function weighted(tickets: readonly Ticket[], include: (ticket: Ticket) => boolean): number {
  let weightedPoints = 0;
  let points = 0;
  for (const ticket of tickets) {
    if (!include(ticket)) {
      continue;
    }
    const score = scoreTicket(ticket);
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
): PersonScore {
  const own = tickets.filter((ticket) => ticket.assigneeId === person.id);
  const closed = closedTickets(own);
  const closedMd = closed.reduce((sum, ticket) => sum + ticket.actualMd, 0);
  const plannedMd = person.plannedMd;
  const planRawPct = plannedMd === 0 ? 0 : (closedMd / plannedMd) * 100;
  const planIndexPct = Math.min(planRawPct, 100);
  const weightedScore = weighted(closed, () => true);
  const inBand = closed.filter((ticket) => scoreTicket(ticket).accuracyInBand).length;
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
    const score = scoreTicket(ticket);
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
    developmentIndex: person.track === 'Implement' ? implementIndex : researchIndex,
  };
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

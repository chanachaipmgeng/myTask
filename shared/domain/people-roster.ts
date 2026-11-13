import { collectAlerts } from './alerts';
import { Person, Ticket, Track } from './models';
import {
  INDEX_TARGET,
  TrackWeights,
  UNPLANNED_TARGET,
  WEEKLY_QUOTA,
  formatMd,
  formatPercent,
  scorePerson,
  scoreTicket,
} from './scoring';

export interface PeopleRosterRow {
  id: string;
  nickname: string;
  role: string;
  personLabel: string;
  level: Person['level'];
  levelLabel: string;
  track: Track;
  trackLabel: string;
  quota: number;
  index: number;
  planRawPct: number;
  planLabel: string;
  weighted: number;
  reworkPct: number;
  sidePct: number;
  sideLabel: string;
  color: string;
  target: number;
  openCount: number;
  closedCount: number;
  accuracyPct: number;
  accuracyLabel: string;
  alertLabel: string;
}

export function buildPeopleRoster(
  people: readonly Person[],
  tickets: readonly Ticket[],
  options?: {
    weights?: TrackWeights;
    quotas?: Record<Person['level'], number>;
    overrunLimit?: number;
  },
): PeopleRosterRow[] {
  const quotas = options?.quotas ?? WEEKLY_QUOTA;
  const overrunLimit = options?.overrunLimit ?? 1.5;
  return people.map((person) => {
    const score = scorePerson(person, tickets, options?.weights);
    const own = tickets.filter((ticket) => ticket.assigneeId === person.id);
    const open = own.filter((ticket) => !ticket.closed);
    const closed = own.filter((ticket) => ticket.closed);
    const weighted = person.track === 'Implement' ? score.weightedScore : score.dodWeightedScore;
    const sidePct = person.track === 'Implement' ? score.unplannedRatio * 100 : score.spikeRatio * 100;
    const sideState =
      person.track === 'Implement'
        ? score.unplannedRatio <= UNPLANNED_TARGET
          ? 'ตามเป้า'
          : 'เกินเป้า'
        : score.spikeInBand
          ? 'ในช่วง'
          : 'นอกช่วง';
    const planCap = score.planRawPct > 100 ? ' · ดัชนีใช้ 100' : '';
    const accuracyPct = round1(score.accuracyShare * 100);
    const alerts = collectAlerts(open, overrunLimit);
    return {
      id: person.id,
      nickname: person.nickname,
      role: person.role,
      personLabel: `${person.nickname} · ${person.role}`,
      level: person.level,
      levelLabel: person.level === 'FirstMonth' ? 'เดือนแรก' : person.level,
      track: person.track,
      trackLabel: person.track === 'RD' ? 'R&D' : 'Implement',
      quota: quotas[person.level],
      index: round1(score.developmentIndex),
      planRawPct: score.planRawPct,
      planLabel: `${formatPercent(score.planRawPct)}% · ${formatMd(score.closedMd)}/${formatMd(score.plannedMd)}${planCap}`,
      weighted: round1(weighted),
      reworkPct: round1(score.reworkRate * 100),
      sidePct: round1(sidePct),
      sideLabel: `${formatPercent(sidePct)}% · ${sideState}`,
      color: person.track === 'RD' ? '#3ec6e0' : '#7eb6ff',
      target: INDEX_TARGET,
      openCount: open.length,
      closedCount: closed.length,
      accuracyPct,
      accuracyLabel: closed.length === 0 ? '—' : `${formatPercent(accuracyPct)}%`,
      alertLabel: alerts.length > 0 ? alerts.map((alert) => alert.shortLabel).join(', ') : '—',
    };
  });
}

/** Closed-ticket score helper for roster tests. */
export function closedTicketScores(personId: string, tickets: readonly Ticket[]): number[] {
  return tickets
    .filter((ticket) => ticket.assigneeId === personId && ticket.closed)
    .map((ticket) => scoreTicket(ticket).total)
    .filter((total): total is number => total !== null);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

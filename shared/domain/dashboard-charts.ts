import { Person, Ticket, Track } from './models';
import { planNewWork } from './capacity';
import { INDEX_TARGET, scoreTicket } from './scoring';

export interface MonthlyPoint {
  month: string;
  plan: number;
  accuracy: number;
  rework: number;
  target: number;
}

export interface QuotaBarPoint {
  id: string;
  nickname: string;
  track: Track;
  used: number;
  free: number;
}

const MONTH_LABELS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function monthlyTrend(
  people: readonly Person[],
  tickets: readonly Ticket[],
  track: Track | 'All',
): MonthlyPoint[] {
  const members = people.filter((person) => track === 'All' || person.track === track);
  const plannedMd = members.reduce((sum, person) => sum + person.plannedMd, 0);
  const memberIds = new Set(members.map((person) => person.id));
  const groups = new Map<string, Ticket[]>();
  for (const ticket of tickets) {
    if (!ticket.closed || !ticket.closedOn || !memberIds.has(ticket.assigneeId)) {
      continue;
    }
    if (track !== 'All' && ticket.track !== track) {
      continue;
    }
    const key = ticket.closedOn.slice(0, 7);
    const group = groups.get(key);
    if (group) {
      group.push(ticket);
    } else {
      groups.set(key, [ticket]);
    }
  }
  return [...groups.keys()].sort().map((key) => {
    const monthTickets = groups.get(key) ?? [];
    const closedMd = monthTickets.reduce((sum, ticket) => sum + ticket.actualMd, 0);
    const inBand = monthTickets.filter((ticket) => scoreTicket(ticket).accuracyInBand).length;
    const reopened = monthTickets.filter((ticket) => ticket.reopenCount > 0).length;
    const count = monthTickets.length;
    return {
      month: monthLabel(key),
      plan: round1(plannedMd === 0 ? 0 : (closedMd / plannedMd) * 100),
      accuracy: round1(count === 0 ? 0 : (inBand / count) * 100),
      rework: round1(count === 0 ? 0 : (reopened / count) * 100),
      target: INDEX_TARGET,
    };
  });
}

export function quotaBars(
  people: readonly Person[],
  tickets: readonly Ticket[],
  track: Track | 'All',
): QuotaBarPoint[] {
  return planNewWork(people, tickets)
    .rows.filter((row) => track === 'All' || row.track === track)
    .map((row) => ({
      id: row.id,
      nickname: row.nickname,
      track: row.track,
      used: row.openMd,
      free: Math.max(0, row.freeMd),
    }));
}

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const index = Number(month) - 1;
  const label = MONTH_LABELS[index] ?? yearMonth;
  return `${label} ${Number(year) + 543}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

import { Person, Ticket, Track } from './models';
import { DEFAULT_TRACK_WEIGHTS, PersonScore, TrackWeights, scorePerson } from './scoring';

export type KpiPeriodType = 'month' | 'quarter';

export interface KpiPeriodBounds {
  /** Inclusive YYYY-MM-DD */
  startOn: string;
  /** Exclusive YYYY-MM-DD */
  endOnExclusive: string;
}

export interface KpiSnapshotRow {
  personId: string;
  nickname: string;
  track: Track;
  periodType: KpiPeriodType;
  periodKey: string;
  score: PersonScore;
}

const MONTH_KEY = /^(\d{4})-(\d{2})$/;
const QUARTER_KEY = /^(\d{4})-Q([1-4])$/;

export function parsePeriodKey(periodType: KpiPeriodType, periodKey: string): void {
  if (periodType === 'month') {
    const match = MONTH_KEY.exec(periodKey);
    if (!match) {
      throw new Error(`periodKey เดือนต้องเป็น YYYY-MM ได้ ${periodKey}`);
    }
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
      throw new Error(`เดือนไม่ถูกต้อง ${periodKey}`);
    }
    return;
  }
  if (!QUARTER_KEY.test(periodKey)) {
    throw new Error(`periodKey ไตรมาสต้องเป็น YYYY-Qn ได้ ${periodKey}`);
  }
}

export function periodBounds(periodType: KpiPeriodType, periodKey: string): KpiPeriodBounds {
  parsePeriodKey(periodType, periodKey);
  if (periodType === 'month') {
    const [yearText, monthText] = periodKey.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const startOn = isoDate(year, month, 1);
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    return { startOn, endOnExclusive: isoDate(next.year, next.month, 1) };
  }
  const match = QUARTER_KEY.exec(periodKey)!;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 3;
  const end =
    endMonth > 12 ? { year: year + 1, month: endMonth - 12 } : { year, month: endMonth };
  return {
    startOn: isoDate(year, startMonth, 1),
    endOnExclusive: isoDate(end.year, end.month, 1),
  };
}

/** `asOf` is YYYY-MM-DD (or longer ISO). */
export function previousMonthKey(asOf: string): string {
  const { year, month } = partsFromDate(asOf);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${pad2(month - 1)}`;
}

/** `asOf` is YYYY-MM-DD (or longer ISO). */
export function previousQuarterKey(asOf: string): string {
  const { year, month } = partsFromDate(asOf);
  const quarter = Math.ceil(month / 3);
  if (quarter === 1) {
    return `${year - 1}-Q4`;
  }
  return `${year}-Q${quarter - 1}`;
}

export function shouldCapturePreviousQuarter(asOf: string): boolean {
  const { month } = partsFromDate(asOf);
  return month === 1 || month === 4 || month === 7 || month === 10;
}

export function ticketsClosedInPeriod(
  tickets: readonly Ticket[],
  bounds: KpiPeriodBounds,
): Ticket[] {
  return tickets.filter(
    (ticket) =>
      ticket.closed &&
      !!ticket.closedOn &&
      ticket.closedOn >= bounds.startOn &&
      ticket.closedOn < bounds.endOnExclusive,
  );
}

/**
 * Freeze PersonScore for each person using only tickets closed inside the period.
 * plannedMd is taken from the person record at capture time.
 */
export function buildPeriodSnapshots(
  people: readonly Person[],
  tickets: readonly Ticket[],
  periodType: KpiPeriodType,
  periodKey: string,
  weights: TrackWeights = DEFAULT_TRACK_WEIGHTS,
): KpiSnapshotRow[] {
  const bounds = periodBounds(periodType, periodKey);
  const inPeriod = ticketsClosedInPeriod(tickets, bounds);
  return people.map((person) => {
    const own = inPeriod.filter((ticket) => ticket.assigneeId === person.id);
    return {
      personId: person.id,
      nickname: person.nickname,
      track: person.track,
      periodType,
      periodKey,
      score: scorePerson(person, own, weights),
    };
  });
}

function partsFromDate(asOf: string): { year: number; month: number } {
  const day = asOf.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) {
    throw new Error(`วันที่ต้องเป็น YYYY-MM-DD ได้ ${asOf}`);
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

import { Person, Ticket, Track } from './models';
import { planNewWork } from './capacity';
import { INDEX_TARGET, TrackWeights, scorePerson, scoreTicket } from './scoring';

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

export interface MdCompositionPoint {
  month: string;
  plannedMd: number;
  unplannedGeneralMd: number;
  mdMandateMd: number;
  totalMd: number;
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

/**
 * Computes monthly Man-day composition: Planned MD vs Unplanned (General) vs MD Mandate
 */
export function mdCompositionTrend(
  tickets: readonly Ticket[],
  personId?: string,
): MdCompositionPoint[] {
  const groups = new Map<string, Ticket[]>();
  for (const ticket of tickets) {
    if (!ticket.closed || !ticket.closedOn) continue;
    if (personId && ticket.assigneeId !== personId) continue;

    const key = ticket.closedOn.slice(0, 7);
    const list = groups.get(key);
    if (list) {
      list.push(ticket);
    } else {
      groups.set(key, [ticket]);
    }
  }

  return [...groups.keys()].sort().map((key) => {
    const monthTickets = groups.get(key) ?? [];
    let plannedMd = 0;
    let unplannedGeneralMd = 0;
    let mdMandateMd = 0;

    for (const t of monthTickets) {
      const effort = t.actualMd || t.estimateMd || 0;
      if (t.isMdDirect) {
        mdMandateMd += effort;
      } else if (t.unplanned) {
        unplannedGeneralMd += effort;
      } else {
        plannedMd += effort;
      }
    }

    plannedMd = round1(plannedMd);
    unplannedGeneralMd = round1(unplannedGeneralMd);
    mdMandateMd = round1(mdMandateMd);
    const totalMd = round1(plannedMd + unplannedGeneralMd + mdMandateMd);

    return {
      month: monthLabel(key),
      plannedMd,
      unplannedGeneralMd,
      mdMandateMd,
      totalMd,
    };
  });
}

export type AccuracyBand = 'in' | 'partial' | 'out';

export interface AccuracyScatterPoint {
  ticketId: string;
  title: string;
  size: string;
  estimateMd: number;
  ratio: number;
  band: AccuracyBand;
  bandLabel: string;
  tip: string;
}

export interface ScoreWaterfallPoint {
  label: string;
  /** ไม่ใส่บนแท่งสรุป — กราฟ Waterfall รวมยอดเองผ่าน sumIndexes */
  points?: number;
}

export interface ScoreWaterfall {
  closedCount: number;
  total: number;
  points: ScoreWaterfallPoint[];
}

export interface PersonMonthIndexCell {
  personId: string;
  nickname: string;
  monthKey: string;
  month: string;
  index: number;
}

export interface PersonMonthIndexHeatmap {
  months: string[];
  people: string[];
  cells: PersonMonthIndexCell[];
}

const BAND_LABEL: Record<AccuracyBand, string> = {
  in: 'ในกรอบ',
  partial: 'ขอบกรอบ',
  out: 'นอกกรอบ',
};

const MAX_HEAT_MONTHS = 12;

/** จุด Scatter ของใบที่ปิด: แกน X = Estimate, แกน Y = อัตราส่วนสุทธิตามสูตรคะแนน */
export function accuracyScatterPoints(tickets: readonly Ticket[]): AccuracyScatterPoint[] {
  const points: AccuracyScatterPoint[] = [];
  for (const ticket of tickets) {
    if (!ticket.closed || ticket.estimateMd <= 0) {
      continue;
    }
    const scored = scoreTicket(ticket);
    if (scored.ratio == null) {
      continue;
    }
    const band: AccuracyBand = scored.accuracy >= 20 ? 'in' : scored.accuracy >= 10 ? 'partial' : 'out';
    points.push({
      ticketId: ticket.id,
      title: ticket.title?.trim() || ticket.module || ticket.id,
      size: ticket.size,
      estimateMd: ticket.estimateMd,
      ratio: scored.ratio,
      band,
      bandLabel: BAND_LABEL[band],
      tip: `${ticket.id} · ขนาด ${ticket.size} · Est ${ticket.estimateMd} MD · อัตราส่วนสุทธิ ${scored.ratio}× · ${BAND_LABEL[band]}`,
    });
  }
  return points;
}

/** ค่าเฉลี่ยส่วนประกอบคะแนนใบที่ปิด (ส่งตรง + ความแม่น + รีวิว + ไม่ถูกเปิดซ้ำ) */
export function scoreWaterfall(tickets: readonly Ticket[]): ScoreWaterfall {
  const closed = tickets.filter((ticket) => ticket.closed);
  if (closed.length === 0) {
    return { closedCount: 0, total: 0, points: [] };
  }
  let week = 0;
  let accuracy = 0;
  let review = 0;
  let reopen = 0;
  for (const ticket of closed) {
    const scored = scoreTicket(ticket);
    week += scored.week;
    accuracy += scored.accuracy;
    review += scored.review;
    reopen += scored.reopen;
  }
  const count = closed.length;
  const weekAvg = round1(week / count);
  const accuracyAvg = round1(accuracy / count);
  const reviewAvg = round1(review / count);
  const reopenAvg = round1(reopen / count);
  return {
    closedCount: count,
    total: round1(weekAvg + accuracyAvg + reviewAvg + reopenAvg),
    points: [
      { label: 'ส่งตรงสัปดาห์', points: weekAvg },
      { label: 'ความแม่น', points: accuracyAvg },
      { label: 'รีวิว', points: reviewAvg },
      { label: 'ไม่ถูกเปิดซ้ำ', points: reopenAvg },
      { label: 'รวมคะแนนใบ' },
    ],
  };
}

/**
 * ดัชนีพัฒนาการรายคนรายเดือน จากใบที่ปิดในเดือนนั้น
 * ใช้สูตรเดียวกับแนวโน้มในโปรไฟล์คน
 */
export function personMonthIndexHeatmap(
  people: readonly Person[],
  tickets: readonly Ticket[],
  weights?: TrackWeights,
): PersonMonthIndexHeatmap {
  const monthKeys = new Set<string>();
  for (const ticket of tickets) {
    if (ticket.closed && ticket.closedOn) {
      monthKeys.add(ticket.closedOn.slice(0, 7));
    }
  }
  const keys = [...monthKeys].sort().slice(-MAX_HEAT_MONTHS);
  const keySet = new Set(keys);
  const usedNames = new Map<string, number>();
  const cells: PersonMonthIndexCell[] = [];
  const shownPeople: string[] = [];

  for (const person of people) {
    const own = tickets.filter(
      (ticket) =>
        ticket.assigneeId === person.id &&
        ticket.closed &&
        ticket.closedOn != null &&
        keySet.has(ticket.closedOn.slice(0, 7)),
    );
    if (own.length === 0) {
      continue;
    }
    const nickname = uniqueNickname(person, usedNames);
    shownPeople.push(nickname);
    const byMonth = new Map<string, Ticket[]>();
    for (const ticket of own) {
      const key = ticket.closedOn!.slice(0, 7);
      const group = byMonth.get(key);
      if (group) {
        group.push(ticket);
      } else {
        byMonth.set(key, [ticket]);
      }
    }
    for (const key of keys) {
      const inMonth = byMonth.get(key);
      if (!inMonth || inMonth.length === 0) {
        continue;
      }
      cells.push({
        personId: person.id,
        nickname,
        monthKey: key,
        month: monthLabel(key),
        index: round1(scorePerson(person, inMonth, weights).developmentIndex),
      });
    }
  }

  return {
    months: keys.map(monthLabel),
    people: shownPeople,
    cells,
  };
}

function uniqueNickname(person: Person, used: Map<string, number>): string {
  const base = person.nickname?.trim() || person.id;
  const seen = used.get(base) ?? 0;
  used.set(base, seen + 1);
  return seen === 0 ? base : `${base} (${person.id})`;
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

import { Ticket } from './models';

/** สถานะรอบประเมินสกอร์การ์ด */
export type ScorecardCycleStatus = 'draft' | 'open' | 'closed';

/**
 * รอบประเมินที่แอดมินเปิดได้ — ปี / ช่วงวัน / ขอบเขตทีม
 * เก็บใน settings.scorecardCycles
 */
export interface ScorecardCycle {
  id: string;
  /** ป้ายแสดง เช่น "ปีงบ 2568" */
  label: string;
  /** ปี ค.ศ. (ใช้คำนวณช่วง) */
  yearCe: number;
  /** ปี พ.ศ. ถ้ามี */
  yearBe?: number | null;
  /** รวมวันเริ่ม YYYY-MM-DD */
  startOn: string;
  /** รวมวันสิ้นสุด YYYY-MM-DD */
  endOn: string;
  /** ว่าง = ทุกทีมในระบบ */
  teamIds: string[];
  status: ScorecardCycleStatus;
  note?: string | null;
}

export interface ScorecardCycleSettings {
  cycles: ScorecardCycle[];
  /** รอบที่กำลังใช้อยู่ทั้งระบบ (ค่าเริ่มเมื่อไม่ระบุใน URL) */
  activeCycleId: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string | null | undefined): value is string {
  return !!value && ISO_DAY.test(value);
}

export function ceToBe(yearCe: number): number {
  return yearCe + 543;
}

export function beToCe(yearBe: number): number {
  return yearBe - 543;
}

export function defaultCycleLabel(yearCe: number): string {
  return `ปี ${ceToBe(yearCe)}`;
}

export function yearBounds(yearCe: number): { startOn: string; endOn: string } {
  return {
    startOn: `${yearCe}-01-01`,
    endOn: `${yearCe}-12-31`,
  };
}

export function createYearCycle(input: {
  yearCe?: number;
  yearBe?: number;
  label?: string;
  teamIds?: string[];
  status?: ScorecardCycleStatus;
  note?: string | null;
  id?: string;
}): ScorecardCycle {
  const yearCe =
    typeof input.yearCe === 'number' && Number.isFinite(input.yearCe)
      ? Math.trunc(input.yearCe)
      : typeof input.yearBe === 'number' && Number.isFinite(input.yearBe)
        ? beToCe(Math.trunc(input.yearBe))
        : new Date().getFullYear();
  const bounds = yearBounds(yearCe);
  const id = input.id?.trim() || `cycle-${yearCe}`;
  return {
    id,
    label: input.label?.trim() || defaultCycleLabel(yearCe),
    yearCe,
    yearBe: ceToBe(yearCe),
    startOn: bounds.startOn,
    endOn: bounds.endOn,
    teamIds: [...(input.teamIds ?? [])],
    status: input.status ?? 'open',
    note: input.note ?? null,
  };
}

export function normalizeCycle(raw: Partial<ScorecardCycle> | null | undefined): ScorecardCycle | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) {
    return null;
  }
  const yearCe =
    typeof raw.yearCe === 'number' && Number.isFinite(raw.yearCe)
      ? Math.trunc(raw.yearCe)
      : typeof raw.yearBe === 'number' && Number.isFinite(raw.yearBe)
        ? beToCe(Math.trunc(raw.yearBe))
        : Number((raw.startOn ?? '').slice(0, 4)) || new Date().getFullYear();
  const startOn = isIsoDay(raw.startOn) ? raw.startOn : yearBounds(yearCe).startOn;
  const endOn = isIsoDay(raw.endOn) ? raw.endOn : yearBounds(yearCe).endOn;
  const status: ScorecardCycleStatus =
    raw.status === 'draft' || raw.status === 'closed' || raw.status === 'open' ? raw.status : 'open';
  const teamIds = Array.isArray(raw.teamIds)
    ? raw.teamIds.filter((id): id is string => typeof id === 'string' && !!id.trim()).map((t) => t.trim())
    : [];
  return {
    id,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : defaultCycleLabel(yearCe),
    yearCe,
    yearBe: typeof raw.yearBe === 'number' ? Math.trunc(raw.yearBe) : ceToBe(yearCe),
    startOn,
    endOn: endOn < startOn ? startOn : endOn,
    teamIds,
    status,
    note: typeof raw.note === 'string' ? raw.note : null,
  };
}

export function normalizeCycleSettings(raw: Partial<ScorecardCycleSettings> | null | undefined): ScorecardCycleSettings {
  const cycles = Array.isArray(raw?.cycles)
    ? raw!.cycles.map((row) => normalizeCycle(row)).filter((row): row is ScorecardCycle => !!row)
    : [];
  const activeCycleId =
    typeof raw?.activeCycleId === 'string' && cycles.some((c) => c.id === raw.activeCycleId)
      ? raw.activeCycleId
      : cycles.find((c) => c.status === 'open')?.id ?? cycles[0]?.id ?? null;
  return { cycles, activeCycleId };
}

export function defaultCycleSettings(asOfYearCe = new Date().getFullYear()): ScorecardCycleSettings {
  const current = createYearCycle({ yearCe: asOfYearCe, status: 'open' });
  const previous = createYearCycle({ yearCe: asOfYearCe - 1, status: 'closed' });
  return {
    cycles: [current, previous],
    activeCycleId: current.id,
  };
}

/** วันที่ที่ใช้อ้างอิงว่าใบอยู่ในรอบ (ปิดก่อน / กำหนดส่ง / เริ่ม) */
export function ticketAnchorDates(ticket: Ticket): string[] {
  const dates: string[] = [];
  for (const raw of [ticket.closedOn, ticket.dueOn, ticket.actualStartOn, ticket.firstDueOn, ticket.devDeliveredOn]) {
    if (!raw) continue;
    const day = String(raw).slice(0, 10);
    if (isIsoDay(day) && !dates.includes(day)) {
      dates.push(day);
    }
  }
  return dates;
}

export function ticketInDateRange(
  ticket: Ticket,
  fromDate?: string | null,
  toDate?: string | null,
): boolean {
  const from = isIsoDay(fromDate) ? fromDate : '';
  const to = isIsoDay(toDate) ? toDate : '';
  if (!from && !to) {
    return true;
  }
  const dates = ticketAnchorDates(ticket);
  if (dates.length === 0) {
    // ไม่มีวันอ้างอิง — คงไว้ในมุมมองเพื่อไม่หายเงียบ
    return true;
  }
  return dates.some((day) => (!from || day >= from) && (!to || day <= to));
}

export function resolveCycleWindow(
  cycle: ScorecardCycle | null | undefined,
  override?: { fromDate?: string | null; toDate?: string | null },
): { fromDate: string; toDate: string } | null {
  const from = isIsoDay(override?.fromDate) ? override!.fromDate! : cycle?.startOn ?? '';
  const to = isIsoDay(override?.toDate) ? override!.toDate! : cycle?.endOn ?? '';
  if (!from && !to) {
    return null;
  }
  return { fromDate: from, toDate: to };
}

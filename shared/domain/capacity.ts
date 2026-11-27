import { EmployeeLeave, Person, Ticket, normalizeTrack, trackDisplayLabel } from './models';
import { WEEKLY_QUOTA, calculateNetWeeklyQuota, formatMd, roundMd } from './scoring';

export const UNPLANNED_RESERVE_MD = 1;
export const WIP_MAX = 2;
export const XL_MAX = 1;

export interface CapacityRow {
  id: string;
  personLabel: string;
  nickname: string;
  level: Person['level'];
  track: Person['track'];
  trackLabel: string;
  quota: number;
  openMd: number;
  openCount: number;
  xlCount: number;
  freeMd: number;
  wipLabel: string;
  xlLabel: string;
  status: string;
  available: boolean;
}

export interface QueuePlan {
  ticket: Ticket;
  fits: boolean;
  personId: string | null;
  personLabel: string;
  text: string;
}

interface LoadState {
  row: CapacityRow;
  freeMd: number;
  openCount: number;
  xlCount: number;
}

export function planNewWork(
  people: readonly Person[],
  tickets: readonly Ticket[],
  quotas: Record<Person['level'], number> = WEEKLY_QUOTA,
  leaves: readonly EmployeeLeave[] = [],
): { rows: CapacityRow[]; plans: QueuePlan[] } {
  const openByAssignee = new Map<string, Ticket[]>();
  const queue: Ticket[] = [];
  for (const ticket of tickets) {
    if (ticket.closed) continue;
    const aid = ticket.assigneeId.trim();
    if (!aid) {
      queue.push(ticket);
    } else {
      const list = openByAssignee.get(aid);
      if (list) list.push(ticket);
      else openByAssignee.set(aid, [ticket]);
    }
  }
  const leavesByUser = new Map<string, EmployeeLeave[]>();
  for (const leave of leaves) {
    const list = leavesByUser.get(leave.userId);
    if (list) list.push(leave);
    else leavesByUser.set(leave.userId, [leave]);
  }
  const rows = people.map((person) =>
    capacityRow(person, openByAssignee.get(person.id) ?? [], quotas, leavesByUser.get(person.id) ?? []),
  );
  const state = new Map<string, LoadState>(
    rows.map((row) => [row.id, { row, freeMd: row.freeMd, openCount: row.openCount, xlCount: row.xlCount }]),
  );
  queue.sort((left, right) => right.estimateMd - left.estimateMd || left.id.localeCompare(right.id));

  const plans = queue.map((ticket) => propose(ticket, state));
  return { rows, plans };
}

function capacityRow(
  person: Person,
  open: readonly Ticket[],
  quotas: Record<Person['level'], number>,
  personLeaves: readonly EmployeeLeave[] = [],
): CapacityRow {
  const openMd = roundMd(open.reduce((sum, ticket) => sum + ticket.estimateMd, 0));
  const leaveDays = personLeaves
    .filter((leave) => leave.leaveType !== 'PUBLIC_HOLIDAY')
    .reduce((sum, leave) => sum + leave.deductMd, 0);
  const holidays = personLeaves
    .filter((leave) => leave.leaveType === 'PUBLIC_HOLIDAY')
    .reduce((sum, leave) => sum + leave.deductMd, 0);
  const quota = calculateNetWeeklyQuota(quotas[person.level], leaveDays, holidays);
  const freeMd = roundMd(quota - openMd - UNPLANNED_RESERVE_MD);
  const openCount = open.length;
  const xlCount = open.filter((ticket) => ticket.size === 'XL').length;
  const available = freeMd > 0 && openCount < WIP_MAX;
  return {
    id: person.id,
    personLabel: `${person.nickname} · ${person.role}`,
    nickname: person.nickname,
    level: person.level,
    track: person.track,
    trackLabel: trackDisplayLabel(person.track),
    quota,
    openMd,
    openCount,
    xlCount,
    freeMd,
    wipLabel: `${openCount}/${WIP_MAX}`,
    xlLabel: `${xlCount}/${XL_MAX}`,
    status: available ? 'ว่าง' : 'ไม่ว่าง',
    available,
  };
}

function propose(ticket: Ticket, state: Map<string, LoadState>): QueuePlan {
  const targetTrack = normalizeTrack(ticket.track);
  const trackLabel = trackDisplayLabel(ticket.track);
  const candidates = [...state.values()]
    .filter((load) => normalizeTrack(load.row.track) === targetTrack)
    .filter((load) => load.openCount < WIP_MAX)
    .filter((load) => ticket.size !== 'XL' || load.xlCount < XL_MAX)
    .filter((load) => load.freeMd + 1e-9 >= ticket.estimateMd)
    .sort(
      (left, right) =>
        right.freeMd - left.freeMd || left.row.nickname.localeCompare(right.row.nickname, 'th'),
    );
  const chosen = candidates[0];
  if (!chosen) {
    return {
      ticket,
      fits: false,
      personId: null,
      personLabel: '',
      text: `${ticket.id} ${formatMd(ticket.estimateMd)} MD ใส่สัปดาห์นี้ไม่ได้ เพราะโควตาที่เหลือ WIP หรือ XL ไม่พอในสาย ${trackLabel}`,
    };
  }
  chosen.freeMd = roundMd(chosen.freeMd - ticket.estimateMd);
  chosen.openCount += 1;
  if (ticket.size === 'XL') {
    chosen.xlCount += 1;
  }
  return {
    ticket,
    fits: true,
    personId: chosen.row.id,
    personLabel: chosen.row.personLabel,
    text: `${ticket.id} ${formatMd(ticket.estimateMd)} MD ใส่สัปดาห์นี้ได้ที่ ${chosen.row.personLabel} หลังกัน 1 MD นอกแผน จะเหลือ ${formatMd(chosen.freeMd)} MD`,
  };
}

import { Ticket } from './models';
import { evaluatePolicySla } from './policy-sla';
import { formatMd, roundMd } from './scoring';
import { todayInBangkok } from './workflow';

export const COMMITTED_WEEK_DAYS = 5;
export const OVERRUN_LIMIT = 1.5;

export interface TicketAlert {
  id: string;
  ticketId: string;
  kind: 'deadline' | 'overrun' | 'policy-alert' | 'policy-breach';
  message: string;
  shortLabel: string;
}

export function alertsForTicket(
  ticket: Ticket,
  overrunLimit = OVERRUN_LIMIT,
  todayIso?: string,
): TicketAlert[] {
  if (ticket.closed) {
    return [];
  }
  const alerts: TicketAlert[] = [];
  const today = (todayIso ?? todayInBangkok()).slice(0, 10);

  const sla = evaluatePolicySla(ticket, today);
  if (sla.state === 'breached') {
    alerts.push({
      id: `${ticket.id}:policy-breach`,
      ticketId: ticket.id,
      kind: 'policy-breach',
      shortLabel: 'เกิน Policy Date',
      message: `${ticket.id} เกินวันครบกำหนด Policy Date (${ticket.policyDate}) และยังไม่มี Reply / ยังไม่ปิดงาน`,
    });
  } else if (sla.state === 'alert-due') {
    alerts.push({
      id: `${ticket.id}:policy-alert`,
      ticketId: ticket.id,
      kind: 'policy-alert',
      shortLabel: 'ถึงวัน Alert SLA',
      message: `${ticket.id} ถึงกำหนดเตือน Alert Date (${ticket.alertDate ?? ticket.policyDate}) · ครบ Policy ${ticket.policyDate ?? '—'}`,
    });
  }

  if (ticket.workingDaysLeft !== null && ticket.workingDaysLeft < 1) {
    alerts.push({
      id: `${ticket.id}:deadline`,
      ticketId: ticket.id,
      kind: 'deadline',
      shortLabel: 'ใกล้หมดสัปดาห์',
      message: `${ticket.id} เหลือ ${formatMd(ticket.workingDaysLeft)} วันทำการในสัปดาห์ที่ commit และยังไม่ปิด`,
    });
  }
  const projected = projectedActual(ticket);
  if (projected !== null && ticket.estimateMd > 0 && projected > ticket.estimateMd * overrunLimit) {
    const overPct = Math.max(0, Math.round((overrunLimit - 1) * 100));
    alerts.push({
      id: `${ticket.id}:overrun`,
      ticketId: ticket.id,
      kind: 'overrun',
      shortLabel: `actual จะเกิน ${overPct}%`,
      message: `${ticket.id} actual มีแนวโน้ม ${formatMd(projected)} MD เกิน estimate ${formatMd(ticket.estimateMd)} MD มากกว่า ${overPct}%`,
    });
  }
  return alerts;
}

export function collectAlerts(
  tickets: readonly Ticket[],
  overrunLimit = OVERRUN_LIMIT,
  todayIso?: string,
): TicketAlert[] {
  const today = (todayIso ?? todayInBangkok()).slice(0, 10);
  return tickets.flatMap((ticket) => alertsForTicket(ticket, overrunLimit, today));
}

export function projectedActual(ticket: Ticket): number | null {
  if (ticket.workingDaysLeft === null) {
    return ticket.actualMd > 0 ? ticket.actualMd : null;
  }
  const elapsed = COMMITTED_WEEK_DAYS - ticket.workingDaysLeft;
  if (elapsed <= 0 || elapsed >= COMMITTED_WEEK_DAYS) {
    return ticket.actualMd;
  }
  return Math.max(ticket.actualMd, roundMd((ticket.actualMd / elapsed) * COMMITTED_WEEK_DAYS));
}

import { Ticket } from './models';
import { formatMd, roundMd } from './scoring';

export const COMMITTED_WEEK_DAYS = 5;
export const OVERRUN_LIMIT = 1.5;

export interface TicketAlert {
  id: string;
  ticketId: string;
  kind: 'deadline' | 'overrun';
  message: string;
  shortLabel: string;
}

export function alertsForTicket(ticket: Ticket, overrunLimit = OVERRUN_LIMIT): TicketAlert[] {
  if (ticket.closed) {
    return [];
  }
  const alerts: TicketAlert[] = [];
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
    alerts.push({
      id: `${ticket.id}:overrun`,
      ticketId: ticket.id,
      kind: 'overrun',
      shortLabel: 'actual จะเกิน 50%',
      message: `${ticket.id} actual มีแนวโน้ม ${formatMd(projected)} MD เกิน estimate ${formatMd(ticket.estimateMd)} MD มากกว่า 50%`,
    });
  }
  return alerts;
}

export function collectAlerts(tickets: readonly Ticket[], overrunLimit = OVERRUN_LIMIT): TicketAlert[] {
  return tickets.flatMap((ticket) => alertsForTicket(ticket, overrunLimit));
}

export function projectedActual(ticket: Ticket): number | null {
  if (ticket.workingDaysLeft === null) {
    return ticket.actualMd > 0 ? ticket.actualMd : null;
  }
  const elapsed = COMMITTED_WEEK_DAYS - ticket.workingDaysLeft;
  if (elapsed <= 0) {
    return ticket.actualMd;
  }
  return roundMd((ticket.actualMd / elapsed) * COMMITTED_WEEK_DAYS);
}

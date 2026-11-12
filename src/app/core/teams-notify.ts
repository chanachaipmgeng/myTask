import { Injectable, signal } from '@angular/core';
import { collectAlerts, projectedActual } from './alerts';
import { Ticket } from './models';
import { formatMd } from './scoring';

export type TeamsEventKind = 'deadline' | 'overrun';

export interface TeamsDraft {
  kind: TeamsEventKind;
  ticketId: string;
  text: string;
}

export interface TeamsLogEntry extends TeamsDraft {
  id: string;
  channel: string;
  status: 'stored-not-sent';
}

/**
 * Stores the Teams message that would be sent. There is no webhook call.
 */
@Injectable({ providedIn: 'root' })
export class TeamsNotifyService {
  readonly channel = signal('dev-alerts');
  readonly deadline = signal(true);
  readonly overrun = signal(true);
  readonly log = signal<TeamsLogEntry[]>([]);
  private sequence = 0;

  testSend(tickets: readonly Ticket[]): TeamsLogEntry[] {
    const channel = this.channel().trim();
    if (!channel) {
      throw new Error('ใส่ชื่อช่อง Teams');
    }
    const kinds = new Set<TeamsEventKind>();
    if (this.deadline()) {
      kinds.add('deadline');
    }
    if (this.overrun()) {
      kinds.add('overrun');
    }
    if (kinds.size === 0) {
      throw new Error('เลือกอย่างน้อยหนึ่งชนิดเหตุ');
    }
    const entries = teamsDrafts(tickets, channel, kinds).map((draft) => {
      this.sequence += 1;
      return {
        ...draft,
        id: `teams-${this.sequence}`,
        channel,
        status: 'stored-not-sent' as const,
      };
    });
    this.log.update((current) => [...entries, ...current]);
    return entries;
  }
}

export function teamsDrafts(
  tickets: readonly Ticket[],
  channel: string,
  kinds: ReadonlySet<TeamsEventKind>,
): TeamsDraft[] {
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  return collectAlerts(tickets)
    .filter((alert) => kinds.has(alert.kind))
    .map((alert) => {
      const ticket = byId.get(alert.ticketId);
      return {
        kind: alert.kind,
        ticketId: alert.ticketId,
        text: ticket ? messageFor(channel, alert.kind, ticket) : `ช่อง ${channel}: ใบ ${alert.ticketId}`,
      };
    });
}

function messageFor(channel: string, kind: TeamsEventKind, ticket: Ticket): string {
  if (kind === 'deadline') {
    return `ช่อง ${channel}: สัปดาห์ที่ commit ใกล้หมด ใบ ${ticket.id} เหลือ ${formatMd(ticket.workingDaysLeft ?? 0)} วันทำการและยังไม่ปิด`;
  }
  const projected = projectedActual(ticket);
  return `ช่อง ${channel}: actual มีแนวโน้มเกิน estimate มากกว่า 50% ใบ ${ticket.id} คาดว่า ${formatMd(projected ?? 0)} MD จาก estimate ${formatMd(ticket.estimateMd)} MD`;
}

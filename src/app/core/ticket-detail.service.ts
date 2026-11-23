import { Injectable, signal } from '@angular/core';

/** Shell-level ticket detail opener — one right drawer shared across all pages. */
@Injectable({ providedIn: 'root' })
export class TicketDetailService {
  private readonly openId = signal<string | null>(null);
  readonly ticketId = this.openId.asReadonly();

  open(ticketId: string): void {
    const id = ticketId.trim();
    if (!id) return;
    this.openId.set(id);
  }

  close(): void {
    this.openId.set(null);
  }
}

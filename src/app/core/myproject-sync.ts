import { Injectable, inject } from '@angular/core';
import { Ticket } from './models';
import { mapTicketRecords } from './ticket-file';
import { ApiClient } from './api-client';

/**
 * Pulls tickets from the Nest OpenProject sync when the API is up.
 * Falls back to the local fixture for offline demos.
 */
export const MYPROJECT_FIXTURE_PATH = '/fixtures/myproject-tickets.json';

export interface MyProjectPullResult {
  tickets: Ticket[];
  source: 'api' | 'fixture';
  sync?: { added: number; updated: number; unchanged: number; errors: string[] };
}

@Injectable({ providedIn: 'root' })
export class MyProjectSyncAdapter {
  private readonly api = inject(ApiClient);

  async pull(peopleIds: readonly string[]): Promise<Ticket[]> {
    const result = await this.pullDetailed(peopleIds);
    return result.tickets;
  }

  async pullDetailed(peopleIds: readonly string[]): Promise<MyProjectPullResult> {
    try {
      const sync = await this.api.syncOpenProject();
      const bootstrap = await this.api.bootstrap();
      return {
        tickets: bootstrap.tickets,
        source: 'api',
        sync: {
          added: sync.added,
          updated: sync.updated,
          unchanged: sync.unchanged,
          errors: sync.errors,
        },
      };
    } catch {
      const response = await fetch(MYPROJECT_FIXTURE_PATH);
      if (!response.ok) {
        throw new Error('อ่านไฟล์ตัวอย่างของ myProject ไม่ได้ และซิงก์ OpenProject ไม่สำเร็จ');
      }
      const body: unknown = await response.json();
      return {
        tickets: mapTicketRecords(body, peopleIds, false),
        source: 'fixture',
      };
    }
  }
}

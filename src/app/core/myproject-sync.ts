import { Injectable } from '@angular/core';
import { Ticket } from './models';
import { mapTicketRecords } from './ticket-file';

/**
 * Local stand-in for myProject. The fixture is a file shipped with this app.
 * There is no API host. Pull only: scores are never written back.
 */
export const MYPROJECT_FIXTURE_PATH = '/fixtures/myproject-tickets.json';

@Injectable({ providedIn: 'root' })
export class MyProjectSyncAdapter {
  async pull(peopleIds: readonly string[]): Promise<Ticket[]> {
    const response = await fetch(MYPROJECT_FIXTURE_PATH);
    if (!response.ok) {
      throw new Error('อ่านไฟล์ตัวอย่างของ myProject ไม่ได้');
    }
    const body: unknown = await response.json();
    return mapTicketRecords(body, peopleIds, false);
  }
}

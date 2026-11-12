import { SEED_PEOPLE, SEED_TICKETS } from '../../../shared/seed';
import { peopleCount, upsertDepartment, upsertPerson, upsertTeam } from '../data/people.repo';
import { defaultSettings, saveSettings } from '../data/settings.repo';
import { upsertWorkItem } from '../data/work-items.repo';
import { Queryable } from './db.service';

/** Seeds org + scorecard demo data when the people table is empty. Safe to call repeatedly. */
export async function seedIfEmpty(db: Queryable, log: (line: string) => void = () => undefined): Promise<boolean> {
  const count = await peopleCount(db);
  if (count > 0) {
    log(`seed skipped: ${count} people already present`);
    return false;
  }

  await upsertDepartment(db, { id: 'dev', name: 'Development' });
  await upsertTeam(db, { id: 'implement', departmentId: 'dev', name: 'Implement', leadId: null });
  await upsertTeam(db, { id: 'rd', departmentId: 'dev', name: 'R&D', leadId: null });

  for (const person of SEED_PEOPLE) {
    const teamId = person.track === 'RD' ? 'rd' : 'implement';
    const access = person.id === 'paweena' ? 'admin' : 'member';
    await upsertPerson(db, {
      ...person,
      teamId,
      access,
    });
  }

  await upsertTeam(db, { id: 'implement', departmentId: 'dev', name: 'Implement', leadId: 'paweena' });
  await upsertTeam(db, { id: 'rd', departmentId: 'dev', name: 'R&D', leadId: 'chanachai' });

  for (const ticket of SEED_TICKETS) {
    await upsertWorkItem(db, { ...ticket, source: ticket.source ?? 'local' });
  }

  await saveSettings(db, defaultSettings(), null);
  log(`seeded ${SEED_PEOPLE.length} people and ${SEED_TICKETS.length} tickets`);
  return true;
}

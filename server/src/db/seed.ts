import {
  SEED_ALLOCATIONS,
  SEED_DISPUTES,
  SEED_LEAVES,
  SEED_PEOPLE,
  SEED_STAGE_LOGS,
  SEED_TICKETS,
} from '../../../shared/seed';
import {
  insertDispute,
  insertStageLog,
  replaceAllocations,
  upsertLeave,
} from '../data/multi-team.repo';
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

  for (const leave of SEED_LEAVES) {
    await upsertLeave(db, { ...leave });
  }
  await replaceAllocations(db, 'IMP-NAT-FEAT', SEED_ALLOCATIONS.map((a) => ({ ...a })));
  await upsertWorkItem(db, {
    ...SEED_TICKETS.find((t) => t.id === 'IMP-NAT-FEAT')!,
    source: 'local',
    isSplitEffort: true,
    allocations: SEED_ALLOCATIONS.map((a) => ({ ...a })),
  });
  for (const logRow of SEED_STAGE_LOGS) {
    await insertStageLog(db, { ...logRow });
  }
  for (const dispute of SEED_DISPUTES) {
    await insertDispute(db, {
      ...dispute,
      reviewerId: 'reviewerId' in dispute ? dispute.reviewerId : null,
      reviewerComment: 'reviewerComment' in dispute ? dispute.reviewerComment : null,
      resolvedAt: 'resolvedAt' in dispute ? dispute.resolvedAt : null,
    });
  }

  await saveSettings(db, defaultSettings(), null);
  log(
    `seeded ${SEED_PEOPLE.length} people, ${SEED_TICKETS.length} tickets, ${SEED_DISPUTES.length} disputes, ${SEED_LEAVES.length} leaves`,
  );
  return true;
}

/** Backfill enterprise demo rows when core seed already exists but multi-team tables are empty. */
export async function seedEnterpriseIfEmpty(
  db: Queryable,
  log: (line: string) => void = () => undefined,
): Promise<boolean> {
  const rows = await db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM ticket_disputes');
  if (Number(rows[0]?.count ?? 0) > 0) {
    log('enterprise seed skipped: disputes already present');
    return false;
  }
  const people = await peopleCount(db);
  if (people === 0) {
    log('enterprise seed skipped: people table empty (run seedIfEmpty first)');
    return false;
  }

  for (const leave of SEED_LEAVES) {
    await upsertLeave(db, { ...leave });
  }
  const splitTicket = SEED_TICKETS.find((t) => t.id === 'IMP-NAT-FEAT');
  if (splitTicket) {
    await replaceAllocations(db, 'IMP-NAT-FEAT', SEED_ALLOCATIONS.map((a) => ({ ...a })));
    await upsertWorkItem(db, {
      ...splitTicket,
      source: splitTicket.source ?? 'local',
      isSplitEffort: true,
      allocations: SEED_ALLOCATIONS.map((a) => ({ ...a })),
    });
  }
  for (const logRow of SEED_STAGE_LOGS) {
    await insertStageLog(db, { ...logRow });
  }
  for (const dispute of SEED_DISPUTES) {
    await insertDispute(db, {
      ...dispute,
      reviewerId: 'reviewerId' in dispute ? dispute.reviewerId : null,
      reviewerComment: 'reviewerComment' in dispute ? dispute.reviewerComment : null,
      resolvedAt: 'resolvedAt' in dispute ? dispute.resolvedAt : null,
    });
  }
  log(`enterprise backfill: ${SEED_DISPUTES.length} disputes, ${SEED_LEAVES.length} leaves`);
  return true;
}

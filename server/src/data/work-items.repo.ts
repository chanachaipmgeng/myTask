import { Ticket } from '../../../shared/domain/models';
import { Queryable } from '../db/db.service';
import { SyncRunRow, WorkItemRow, ticketFromRow } from './types';

export async function listWorkItems(db: Queryable): Promise<Ticket[]> {
  const rows = await db.query<WorkItemRow>('SELECT * FROM work_items ORDER BY id');
  return rows.map(ticketFromRow);
}

export async function getWorkItem(db: Queryable, id: string): Promise<Ticket | null> {
  const rows = await db.query<WorkItemRow>('SELECT * FROM work_items WHERE id = $1', [id]);
  return rows[0] ? ticketFromRow(rows[0]) : null;
}

export async function getWorkItemByOpId(db: Queryable, opId: number): Promise<Ticket | null> {
  const rows = await db.query<WorkItemRow>('SELECT * FROM work_items WHERE op_id = $1', [opId]);
  return rows[0] ? ticketFromRow(rows[0]) : null;
}

export async function upsertWorkItem(db: Queryable, ticket: Ticket, syncedAt: Date | null = null): Promise<Ticket> {
  const source = ticket.source ?? 'local';
  await db.query(
    `INSERT INTO work_items (id, source, op_id, assignee_id, closed, closed_on, data, synced_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())
     ON CONFLICT (id) DO UPDATE SET
       source = EXCLUDED.source,
       op_id = EXCLUDED.op_id,
       assignee_id = EXCLUDED.assignee_id,
       closed = EXCLUDED.closed,
       closed_on = EXCLUDED.closed_on,
       data = EXCLUDED.data,
       synced_at = COALESCE(EXCLUDED.synced_at, work_items.synced_at),
       updated_at = now()`,
    [
      ticket.id,
      source,
      ticket.opId ?? null,
      ticket.assigneeId,
      ticket.closed,
      ticket.closedOn,
      JSON.stringify(ticket),
      syncedAt,
    ],
  );
  const saved = await getWorkItem(db, ticket.id);
  if (!saved) {
    throw new Error(`failed to upsert work item ${ticket.id}`);
  }
  return saved;
}

export async function insertWorkItems(db: Queryable, tickets: readonly Ticket[]): Promise<string[]> {
  const added: string[] = [];
  for (const ticket of tickets) {
    const existing = await getWorkItem(db, ticket.id);
    if (existing) {
      continue;
    }
    await upsertWorkItem(db, ticket);
    added.push(ticket.id);
  }
  return added;
}

export async function nextLocalTicketId(db: Queryable): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM work_items WHERE id ~ '^T-[0-9]+$' ORDER BY id DESC LIMIT 1`,
  );
  const last = rows[0]?.id;
  const next = last ? Number(last.slice(2)) + 1 : 1;
  return `T-${String(next).padStart(3, '0')}`;
}

export async function startSyncRun(
  db: Queryable,
  input: {
    connection: string;
    trigger: 'manual' | 'schedule';
    startedBy: string | null;
    since: Date | null;
  },
): Promise<number> {
  const rows = await db.query<{ id: string }>(
    `INSERT INTO sync_runs (connection, trigger, started_by, since, status)
     VALUES ($1, $2, $3, $4, 'running')
     RETURNING id::text`,
    [input.connection, input.trigger, input.startedBy, input.since],
  );
  return Number(rows[0]!.id);
}

export async function finishSyncRun(
  db: Queryable,
  id: number,
  result: {
    status: 'success' | 'failed';
    added: number;
    updated: number;
    unchanged: number;
    errors: unknown[];
  },
): Promise<void> {
  await db.query(
    `UPDATE sync_runs
     SET finished_at = now(), status = $2, added = $3, updated = $4, unchanged = $5, errors = $6::jsonb
     WHERE id = $1`,
    [id, result.status, result.added, result.updated, result.unchanged, JSON.stringify(result.errors)],
  );
}

export async function lastSuccessfulSync(db: Queryable, connection: string): Promise<SyncRunRow | null> {
  const rows = await db.query<SyncRunRow>(
    `SELECT * FROM sync_runs
     WHERE connection = $1 AND status = 'success'
     ORDER BY finished_at DESC NULLS LAST
     LIMIT 1`,
    [connection],
  );
  return rows[0] ?? null;
}

export async function listSyncRuns(db: Queryable, connection: string, limit = 20): Promise<SyncRunRow[]> {
  return db.query<SyncRunRow>(
    `SELECT * FROM sync_runs WHERE connection = $1 ORDER BY started_at DESC LIMIT $2`,
    [connection, limit],
  );
}

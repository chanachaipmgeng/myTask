import { Ticket } from '../../../shared/domain/models';
import { ListFilterPredicate, ListSortDir } from '../common/list-query';
import { Queryable } from '../db/db.service';
import { SyncRunRow, WorkItemRow, ticketFromRow } from './types';

export async function listWorkItems(db: Queryable): Promise<Ticket[]> {
  const rows = await db.query<WorkItemRow>('SELECT * FROM work_items ORDER BY id');
  return rows.map(ticketFromRow);
}

export type WorkspaceTicketMode = 'all' | 'rd';

/**
 * Bootstrap / hub slice — ไม่ SELECT * ทั้งตาราง
 * - closed = false หรือปิดไม่เกิน closedWithinDays
 * - หรือ assignee อยู่ใน activePeopleIds
 * - โหมด rd: จำกัด RD หรือ assignee ที่ active
 */
export async function listWorkItemsForWorkspace(
  db: Queryable,
  opts: {
    mode: WorkspaceTicketMode;
    activePeopleIds: readonly string[];
    allowedAssigneeIds?: readonly string[] | null;
    closedWithinDays?: number;
  },
): Promise<Ticket[]> {
  const days = Math.max(30, opts.closedWithinDays ?? 120);
  const params: unknown[] = [days];
  const where: string[] = [];

  if (opts.mode === 'rd') {
    params.push(opts.activePeopleIds);
    where.push(
      `(data->>'track' = 'RD' OR (assignee_id <> '' AND assignee_id = ANY($${params.length}::text[])))`,
    );
  } else {
    params.push(opts.activePeopleIds);
    where.push(
      `(closed = false
        OR closed_on >= (CURRENT_DATE - ($1::int * INTERVAL '1 day'))
        OR data->>'track' = 'RD'
        OR (assignee_id <> '' AND assignee_id = ANY($${params.length}::text[]))
        OR COALESCE(data->>'dueOn','') <> ''
        OR COALESCE(data->>'firstDueOn','') <> ''
        OR COALESCE(data->>'actualStartOn','') <> '')`,
    );
  }

  if (opts.allowedAssigneeIds != null) {
    if (opts.allowedAssigneeIds.length === 0) {
      return [];
    }
    params.push(opts.allowedAssigneeIds);
    where.push(
      `(assignee_id = '' OR assignee_id = ANY($${params.length}::text[]))`,
    );
  }

  const sql = `SELECT * FROM work_items WHERE ${where.join(' AND ')} ORDER BY id`;
  const rows = await db.query<WorkItemRow>(sql, params);
  return rows.map(ticketFromRow);
}

const SORT_SQL: Record<string, string> = {
  id: 'id',
  assigneeId: 'assignee_id',
  closed: 'closed',
  closedOn: 'closed_on',
  updatedAt: 'updated_at',
  track: `data->>'track'`,
  title: `data->>'title'`,
  module: `data->>'module'`,
  estimateMd: `(NULLIF(data->>'estimateMd',''))::float8`,
  actualMd: `(NULLIF(data->>'actualMd',''))::float8`,
  dueOn: `data->>'dueOn'`,
  firstDueOn: `data->>'firstDueOn'`,
  workflowStatus: `COALESCE(data->>'workflowStatus', CASE WHEN closed THEN 'Done' ELSE 'In Progress' END)`,
  opProject: `data->>'opProject'`,
  opType: `COALESCE(data->>'opType', data->>'type')`,
  project: `COALESCE(data->>'opProject', data->>'module')`,
};

export interface WorkItemPageQuery {
  q?: string;
  statusScope?: 'unclosed' | 'closed' | 'all';
  assigneeId?: string;
  /** When set, restrict to these assignees (team / workspace scope). null = no scope. */
  assigneeIds?: readonly string[] | null;
  project?: string;
  opType?: string;
  track?: string;
  sort?: string;
  dir?: ListSortDir;
  limit: number;
  offset: number;
  maxLimit?: number;
  filters?: readonly ListFilterPredicate[];
}

function pushFilterSql(
  pred: ListFilterPredicate,
  params: unknown[],
  clauses: string[],
): void {
  const expr =
    pred.field === 'workflowStatus'
      ? `COALESCE(data->>'workflowStatus', CASE WHEN closed THEN 'Done' ELSE 'In Progress' END)`
      : pred.field === 'project' || pred.field === 'opProject'
        ? `COALESCE(data->>'opProject', data->>'module')`
        : pred.field === 'assigneeId'
          ? 'assignee_id'
          : pred.field === 'id'
            ? 'id'
            : pred.field === 'track'
              ? `data->>'track'`
              : pred.field === 'title'
                ? `data->>'title'`
                : pred.field === 'module'
                  ? `data->>'module'`
                  : pred.field === 'opType' || pred.field === 'type'
                    ? `COALESCE(data->>'opType', data->>'type')`
                    : null;
  if (!expr) return;
  const p = params.length + 1;
  switch (pred.operator) {
    case 'equal':
      if (pred.value === null) {
        clauses.push(`(${expr} IS NULL OR ${expr} = '')`);
      } else {
        params.push(String(pred.value));
        clauses.push(`LOWER(COALESCE(${expr},'')) = LOWER($${p})`);
      }
      break;
    case 'notequal':
      if (pred.value === null) {
        clauses.push(`(${expr} IS NOT NULL AND ${expr} <> '')`);
      } else {
        params.push(String(pred.value));
        clauses.push(`LOWER(COALESCE(${expr},'')) <> LOWER($${p})`);
      }
      break;
    case 'contains':
      params.push(`%${String(pred.value ?? '')}%`);
      clauses.push(`COALESCE(${expr},'') ILIKE $${p}`);
      break;
    case 'startswith':
      params.push(`${String(pred.value ?? '')}%`);
      clauses.push(`COALESCE(${expr},'') ILIKE $${p}`);
      break;
    case 'endswith':
      params.push(`%${String(pred.value ?? '')}`);
      clauses.push(`COALESCE(${expr},'') ILIKE $${p}`);
      break;
    case 'greaterthan':
      params.push(pred.value);
      clauses.push(`${expr} > $${p}::text`);
      break;
    case 'greaterthanorequal':
      params.push(pred.value);
      clauses.push(`${expr} >= $${p}::text`);
      break;
    case 'lessthan':
      params.push(pred.value);
      clauses.push(`${expr} < $${p}::text`);
      break;
    case 'lessthanorequal':
      params.push(pred.value);
      clauses.push(`${expr} <= $${p}::text`);
      break;
    default:
      break;
  }
}

function buildWorkItemWhere(query: WorkItemPageQuery): { whereSql: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (query.statusScope === 'unclosed') {
    clauses.push('closed = false');
  } else if (query.statusScope === 'closed') {
    clauses.push('closed = true');
  }

  if (query.assigneeId) {
    params.push(query.assigneeId);
    clauses.push(`assignee_id = $${params.length}`);
  } else if (query.assigneeIds != null) {
    if (query.assigneeIds.length === 0) {
      clauses.push('FALSE');
    } else {
      params.push(query.assigneeIds);
      clauses.push(`assignee_id = ANY($${params.length}::text[])`);
    }
  }

  if (query.project) {
    params.push(query.project);
    clauses.push(
      `(data->>'opProject' = $${params.length} OR data->>'module' = $${params.length} OR id = $${params.length})`,
    );
  }

  if (query.opType) {
    params.push(query.opType);
    clauses.push(`(data->>'opType' = $${params.length} OR data->>'type' = $${params.length})`);
  }

  if (query.track && query.track !== 'All') {
    params.push(query.track);
    clauses.push(`data->>'track' = $${params.length}`);
  }

  if (query.q) {
    params.push(`%${query.q}%`);
    const p = params.length;
    clauses.push(
      `(id ILIKE $${p} OR COALESCE(data->>'title','') ILIKE $${p} OR COALESCE(data->>'module','') ILIKE $${p} OR assignee_id ILIKE $${p})`,
    );
  }

  for (const pred of query.filters ?? []) {
    pushFilterSql(pred, params, clauses);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

export async function queryWorkItemsPage(
  db: Queryable,
  query: WorkItemPageQuery,
): Promise<{ items: Ticket[]; total: number; unclosedCount: number; closedCount: number }> {
  const { whereSql, params } = buildWorkItemWhere(query);
  const sortExpr = SORT_SQL[query.sort || ''] ?? 'id';
  const dir = query.dir === 'desc' ? 'DESC' : 'ASC';
  const cap = Math.max(1, Math.min(50_000, query.maxLimit ?? 100));
  const limit = Math.max(1, Math.min(cap, query.limit || 25));
  const offset = Math.max(0, query.offset || 0);

  const countParams = [...params];
  const countSql = `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE closed = false)::int AS unclosed,
      COUNT(*) FILTER (WHERE closed = true)::int AS closed
    FROM work_items ${whereSql}`;
  const counts = await db.query<{ total: number; unclosed: number; closed: number }>(
    countSql,
    countParams,
  );
  const total = Number(counts[0]?.total ?? 0);
  const unclosedCount = Number(counts[0]?.unclosed ?? 0);
  const closedCount = Number(counts[0]?.closed ?? 0);

  const pageParams = [...params, limit, offset];
  const pageSql = `SELECT * FROM work_items ${whereSql}
    ORDER BY ${sortExpr} ${dir} NULLS LAST, id ASC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const rows = await db.query<WorkItemRow>(pageSql, pageParams);
  return {
    items: rows.map(ticketFromRow),
    total,
    unclosedCount,
    closedCount,
  };
}

/** Lightweight local search — capped, SQL ILIKE (ไม่โหลดทั้งตาราง) */
export async function searchWorkItemsLocal(
  db: Queryable,
  q: string,
  limit = 20,
): Promise<Ticket[]> {
  const needle = `%${q.trim()}%`;
  if (!q.trim()) return [];
  const rows = await db.query<WorkItemRow>(
    `SELECT * FROM work_items
     WHERE id ILIKE $1
        OR COALESCE(data->>'title','') ILIKE $1
        OR COALESCE(data->>'module','') ILIKE $1
     ORDER BY closed ASC, updated_at DESC NULLS LAST
     LIMIT $2`,
    [needle, limit],
  );
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
  const rows = await db.query<{ n: string }>(`SELECT nextval('local_ticket_seq')::text AS n`);
  const next = Number(rows[0]?.n ?? 1);
  return `T-${String(next).padStart(3, '0')}`;
}

export async function markStaleSyncRunsFailed(
  db: Queryable,
  olderThanMinutes = 30,
): Promise<number> {
  const rows = await db.query<{ id: string }>(
    `UPDATE sync_runs
     SET status = 'failed',
         finished_at = now(),
         errors = COALESCE(errors, '[]'::jsonb) || '["aborted: server restarted before sync finished"]'::jsonb
     WHERE status = 'running'
       AND started_at < now() - ($1::integer * interval '1 minute')
     RETURNING id::text`,
    [Math.max(1, Math.floor(olderThanMinutes))],
  );
  return rows.length;
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

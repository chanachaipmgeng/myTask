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
 * Bootstrap / hub slice — กรองตามช่วงเวลาและไม่ SELECT * ทั้งตาราง
 * - ใบปิด: เฉพาะที่ปิดภายใน closedWithinDays (ค่าเริ่ม 180 วัน)
 * - ใบเปิด: เฉพาะที่มีความเคลื่อนไหว/กำหนดส่งภายใน openWithinDays (ค่าเริ่ม 365 วัน) หรือ local
 * - ตัดใบงานจากโปรเจกต์ที่ถูกปิดใช้งานในแคตตาล็อก (inactiveProjectKeys)
 * - จำกัดจำนวนแถวสูงสุด (maxRows, ค่าเริ่ม 2,500) และตัด note ยาวออกเพื่อลดขนาด JSON payload
 */
export async function listWorkItemsForWorkspace(
  db: Queryable,
  opts: {
    mode: WorkspaceTicketMode;
    activePeopleIds: readonly string[];
    allowedAssigneeIds?: readonly string[] | null;
    inactiveProjectKeys?: readonly string[];
    closedWithinDays?: number;
    openWithinDays?: number;
    maxRows?: number;
  },
): Promise<{ tickets: Ticket[]; truncated: boolean }> {
  const closedDays = Math.max(30, opts.closedWithinDays ?? 180);
  const openDays = Math.max(60, opts.openWithinDays ?? 365);
  const maxRows = Math.max(100, Math.min(10_000, opts.maxRows ?? 2_500));
  const params: unknown[] = [closedDays, openDays];
  const where: string[] = [
    `(
      (closed = true AND closed_on >= (CURRENT_DATE - ($1::int * INTERVAL '1 day')))
      OR (
        closed = false
        AND (
          source = 'local'
          OR updated_at >= (CURRENT_DATE - ($2::int * INTERVAL '1 day'))
          OR COALESCE(data->>'dueOn','') >= to_char(CURRENT_DATE - ($2::int * INTERVAL '1 day'), 'YYYY-MM-DD')
          OR COALESCE(data->>'firstDueOn','') >= to_char(CURRENT_DATE - ($2::int * INTERVAL '1 day'), 'YYYY-MM-DD')
        )
      )
    )`,
  ];

  if (opts.mode === 'rd') {
    params.push(opts.activePeopleIds);
    where.push(
      `(data->>'track' = 'RD' OR (assignee_id <> '' AND assignee_id = ANY($${params.length}::text[])))`,
    );
  }

  if (opts.allowedAssigneeIds != null) {
    if (opts.allowedAssigneeIds.length === 0) {
      return { tickets: [], truncated: false };
    }
    params.push(opts.allowedAssigneeIds);
    where.push(
      `(assignee_id = '' OR assignee_id = ANY($${params.length}::text[]))`,
    );
  }

  const inactive = (opts.inactiveProjectKeys ?? []).map((s) => s.trim()).filter(Boolean);
  if (inactive.length > 0) {
    params.push(inactive);
    where.push(`NOT (COALESCE(data->>'opProject','') = ANY($${params.length}::text[]))`);
  }

  params.push(maxRows + 1);
  const sql = `SELECT * FROM work_items
    WHERE ${where.join(' AND ')}
    ORDER BY closed ASC, updated_at DESC, id ASC
    LIMIT $${params.length}`;
  const rows = await db.query<WorkItemRow>(sql, params);
  const truncated = rows.length > maxRows;
  const sliced = truncated ? rows.slice(0, maxRows) : rows;
  const tickets = sliced.map((row) => slimTicketForWorkspace(ticketFromRow(row)));
  return { tickets, truncated };
}

function slimTicketForWorkspace(ticket: Ticket): Ticket {
  if (!ticket.note || ticket.note.length <= 240) {
    return ticket;
  }
  return {
    ...ticket,
    note: `${ticket.note.slice(0, 237)}...`,
  };
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
    // Match GIN trigram index work_items_search_trgm_idx expression directly
    clauses.push(
      `((id || ' ' || COALESCE(data->>'title', '') || ' ' || COALESCE(data->>'module', '')) ILIKE $${p} OR assignee_id ILIKE $${p})`,
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

/** Lightweight local search — matches work_items_search_trgm_idx GIN trigram index */
export async function searchWorkItemsLocal(
  db: Queryable,
  q: string,
  limit = 20,
): Promise<Ticket[]> {
  const needle = `%${q.trim()}%`;
  if (!q.trim()) return [];
  const rows = await db.query<WorkItemRow>(
    `SELECT * FROM work_items
     WHERE (id || ' ' || COALESCE(data->>'title', '') || ' ' || COALESCE(data->>'module', '')) ILIKE $1
     ORDER BY closed ASC, updated_at DESC NULLS LAST
     LIMIT $2`,
    [needle, limit],
  );
  return rows.map(ticketFromRow);
}

export async function listOpenWorkItemsByAssignee(db: Queryable, assigneeId: string): Promise<Ticket[]> {
  const rows = await db.query<WorkItemRow>(
    `SELECT * FROM work_items WHERE assignee_id = $1 AND closed = false ORDER BY id`,
    [assigneeId],
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
  const rows = await db.query<WorkItemRow>(
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
       updated_at = now()
     RETURNING *`,
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
  if (!rows[0]) {
    throw new Error(`failed to upsert work item ${ticket.id}`);
  }
  return ticketFromRow(rows[0]);
}

export async function insertWorkItems(db: Queryable, tickets: readonly Ticket[]): Promise<string[]> {
  if (tickets.length === 0) return [];
  const added: string[] = [];
  const chunkSize = 200;
  for (let i = 0; i < tickets.length; i += chunkSize) {
    const chunk = tickets.slice(i, i + chunkSize);
    const values: string[] = [];
    const params: unknown[] = [];
    chunk.forEach((ticket, idx) => {
      const base = idx * 7;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}::jsonb, NULL, now())`);
      params.push(
        ticket.id,
        ticket.source ?? 'local',
        ticket.opId ?? null,
        ticket.assigneeId,
        ticket.closed,
        ticket.closedOn,
        JSON.stringify(ticket),
      );
    });
    const rows = await db.query<{ id: string }>(
      `INSERT INTO work_items (id, source, op_id, assignee_id, closed, closed_on, data, synced_at, updated_at)
       VALUES ${values.join(', ')}
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      params,
    );
    for (const r of rows) {
      added.push(r.id);
    }
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

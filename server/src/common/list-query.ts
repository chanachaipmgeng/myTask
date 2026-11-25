/** Query มาตรฐานสำหรับลิสต์ที่แบ่งหน้าบน API: q, page, pageSize, sort, dir (+ ตัวกรองร่วม) */

export type ListSortDir = 'asc' | 'desc';

/** สถานะใช้งานแคตตาล็อก (โปรเจกต์ / เอนทิตี active flag) */
export type ListActiveFilter = 'all' | 'active' | 'inactive';

export interface ListQuery {
  q: string;
  page: number;
  pageSize: number;
  sort: string;
  dir: ListSortDir;
  offset: number;
  /** true เมื่อ client ส่ง page หรือ pageSize มา — ใช้แบ่งหน้าจริง */
  pagingRequested: boolean;
  teamId?: string;
  assigneeId?: string;
  statusScope?: 'unclosed' | 'closed' | 'all';
  project?: string;
  opType?: string;
  track?: string;
  active?: ListActiveFilter;
}

export interface ListPageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function asPositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.floor(n);
}

export function parseListQuery(
  query: Record<string, string | undefined>,
  options?: { defaultPageSize?: number; defaultSort?: string; defaultDir?: ListSortDir },
): ListQuery {
  const pagingRequested = query['page'] != null || query['pageSize'] != null;
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    asPositiveInt(query['pageSize'], options?.defaultPageSize ?? DEFAULT_PAGE_SIZE),
  );
  const page = asPositiveInt(query['page'], 1);
  const dirRaw = (query['dir'] ?? options?.defaultDir ?? 'asc').toLowerCase();
  const dir: ListSortDir = dirRaw === 'desc' ? 'desc' : 'asc';
  const statusScopeRaw = (query['statusScope'] ?? query['status'] ?? '').trim().toLowerCase();
  const statusScope =
    statusScopeRaw === 'closed' || statusScopeRaw === 'all' || statusScopeRaw === 'unclosed'
      ? (statusScopeRaw as 'unclosed' | 'closed' | 'all')
      : undefined;
  const activeRaw = (query['active'] ?? query['filterStatus'] ?? '').trim().toLowerCase();
  const active: ListActiveFilter | undefined =
    activeRaw === 'active' || activeRaw === 'true' || activeRaw === '1'
      ? 'active'
      : activeRaw === 'inactive' || activeRaw === 'false' || activeRaw === '0'
        ? 'inactive'
        : activeRaw === 'all'
          ? 'all'
          : undefined;

  return {
    q: (query['q'] ?? '').trim(),
    page,
    pageSize,
    sort: (query['sort'] ?? options?.defaultSort ?? '').trim(),
    dir,
    offset: (page - 1) * pageSize,
    pagingRequested,
    teamId: (query['teamId'] ?? query['team'] ?? '').trim() || undefined,
    assigneeId: (query['assigneeId'] ?? query['person'] ?? query['personId'] ?? '').trim() || undefined,
    statusScope,
    project: (query['project'] ?? query['opProject'] ?? '').trim() || undefined,
    opType: (query['opType'] ?? query['type'] ?? '').trim() || undefined,
    track: (query['track'] ?? '').trim() || undefined,
    active,
  };
}

/** แบ่งหน้าเมื่อ client ขอเพจ — ถ้าไม่ขอ คืนทั้งชุด (รองรับผู้เรียกเก่า) */
export function toListPageResult<T>(
  items: readonly T[],
  query: ListQuery,
): ListPageResult<T> {
  if (!query.pagingRequested) {
    return {
      items: [...items],
      total: items.length,
      page: 1,
      pageSize: Math.max(items.length, 1),
    };
  }
  return paginateItems(items, query);
}

export function paginateItems<T>(
  items: readonly T[],
  query: ListQuery,
): ListPageResult<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const offset = (page - 1) * query.pageSize;
  return {
    items: items.slice(offset, offset + query.pageSize),
    total,
    page,
    pageSize: query.pageSize,
  };
}

export function compareByField<T>(
  left: T,
  right: T,
  field: string,
  dir: ListSortDir,
  resolve?: (row: T, key: string) => unknown,
): number {
  const getter = resolve ?? ((row: T, key: string) => (row as Record<string, unknown>)[key]);
  const a = getter(left, field);
  const b = getter(right, field);
  let cmp = 0;
  if (typeof a === 'number' && typeof b === 'number') {
    cmp = a - b;
  } else {
    cmp = String(a ?? '').localeCompare(String(b ?? ''), 'th', { numeric: true, sensitivity: 'base' });
  }
  return dir === 'desc' ? -cmp : cmp;
}

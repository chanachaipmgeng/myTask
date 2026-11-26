/** Query มาตรฐานสำหรับลิสต์ที่แบ่งหน้าบน API: q, page, pageSize, sort, dir (+ ตัวกรองร่วม) */

export type ListSortDir = 'asc' | 'desc';

/** สถานะใช้งานแคตตาล็อก (โปรเจกต์ / เอนทิตี active flag) */
export type ListActiveFilter = 'all' | 'active' | 'inactive';

/** ชุดย่อยของ Syncfusion Excel / Menu filter → ส่งเป็น JSON ใน `filters` */
export type ListFilterOperator =
  | 'equal'
  | 'notequal'
  | 'contains'
  | 'startswith'
  | 'endswith'
  | 'greaterthan'
  | 'greaterthanorequal'
  | 'lessthan'
  | 'lessthanorequal';

export interface ListFilterPredicate {
  field: string;
  operator: ListFilterOperator;
  value: string | number | boolean | null;
}

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
  /** จาก Syncfusion DataState / Excel filter */
  filters: ListFilterPredicate[];
  fromDate?: string;
  toDate?: string;
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
    filters: parseFilterPredicates(query['filters']),
    fromDate: (query['from'] ?? query['fromDate'] ?? '').trim() || undefined,
    toDate: (query['to'] ?? query['toDate'] ?? '').trim() || undefined,
  };
}

const ALLOWED_FILTER_OPS = new Set<ListFilterOperator>([
  'equal',
  'notequal',
  'contains',
  'startswith',
  'endswith',
  'greaterthan',
  'greaterthanorequal',
  'lessthan',
  'lessthanorequal',
]);

/** แปลง `filters` จาก query string (JSON array) เป็น predicate ชุดย่อย */
export function parseFilterPredicates(raw: string | undefined): ListFilterPredicate[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ListFilterPredicate[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const field = String((item as { field?: unknown }).field ?? '').trim();
      const operatorRaw = String((item as { operator?: unknown }).operator ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_]/g, '') as ListFilterOperator;
      if (!field || !ALLOWED_FILTER_OPS.has(operatorRaw)) continue;
      const value = (item as { value?: unknown }).value;
      out.push({
        field,
        operator: operatorRaw,
        value:
          value === null || value === undefined
            ? null
            : typeof value === 'number' || typeof value === 'boolean'
              ? value
              : String(value),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** กรองแถวด้วย predicate ชุดย่อย (Excel filter ของ Syncfusion) */
export function applyFilterPredicates<T>(
  items: readonly T[],
  filters: readonly ListFilterPredicate[],
  resolve?: (row: T, key: string) => unknown,
): T[] {
  if (!filters.length) return [...items];
  const getter = resolve ?? ((row: T, key: string) => (row as Record<string, unknown>)[key]);
  return items.filter((row) =>
    filters.every((pred) => matchPredicate(getter(row, pred.field), pred.operator, pred.value)),
  );
}

function matchPredicate(
  raw: unknown,
  operator: ListFilterOperator,
  expected: ListFilterPredicate['value'],
): boolean {
  if (operator === 'equal') {
    if (expected === null) return raw == null || raw === '';
    return String(raw ?? '').toLowerCase() === String(expected).toLowerCase();
  }
  if (operator === 'notequal') {
    if (expected === null) return raw != null && raw !== '';
    return String(raw ?? '').toLowerCase() !== String(expected).toLowerCase();
  }
  const left = String(raw ?? '').toLowerCase();
  const right = String(expected ?? '').toLowerCase();
  if (operator === 'contains') return left.includes(right);
  if (operator === 'startswith') return left.startsWith(right);
  if (operator === 'endswith') return left.endsWith(right);
  const ln = Number(raw);
  const rn = Number(expected);
  if (!Number.isFinite(ln) || !Number.isFinite(rn)) return false;
  if (operator === 'greaterthan') return ln > rn;
  if (operator === 'greaterthanorequal') return ln >= rn;
  if (operator === 'lessthan') return ln < rn;
  if (operator === 'lessthanorequal') return ln <= rn;
  return true;
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

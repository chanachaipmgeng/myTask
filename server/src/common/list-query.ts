/** Query มาตรฐานสำหรับลิสต์ที่แบ่งหน้าบน API: q, page, pageSize, sort, dir */

export type ListSortDir = 'asc' | 'desc';

export interface ListQuery {
  q: string;
  page: number;
  pageSize: number;
  sort: string;
  dir: ListSortDir;
  offset: number;
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
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    asPositiveInt(query['pageSize'], options?.defaultPageSize ?? DEFAULT_PAGE_SIZE),
  );
  const page = asPositiveInt(query['page'], 1);
  const dirRaw = (query['dir'] ?? options?.defaultDir ?? 'asc').toLowerCase();
  const dir: ListSortDir = dirRaw === 'desc' ? 'desc' : 'asc';
  return {
    q: (query['q'] ?? '').trim(),
    page,
    pageSize,
    sort: (query['sort'] ?? options?.defaultSort ?? '').trim(),
    dir,
    offset: (page - 1) * pageSize,
  };
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

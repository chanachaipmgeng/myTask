/** ช่วยแบ่งหน้าชุดการ์ด/รายการบนไคลเอนต์ — ใช้คู่กับค้นหาและเรียงในหน้า */

export const CARD_PAGE_SIZE = 12;

export function totalPages(totalItems: number, pageSize = CARD_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, totalItems) / pageSize));
}

export function pageSlice<T>(items: readonly T[], page: number, pageSize = CARD_PAGE_SIZE): T[] {
  const safePage = Math.min(Math.max(1, page), totalPages(items.length, pageSize));
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export type CardSortMode = 'name' | 'index';

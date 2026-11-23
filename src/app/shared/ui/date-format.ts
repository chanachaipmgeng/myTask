import { Pipe, PipeTransform } from '@angular/core';

const THAI_MONTH_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/**
 * Parses an ISO string or Date into a Date object safely.
 */
export function parseDate(raw: string | Date | null | undefined): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Standard date-time format: DD/MM/YYYY HH:mm (e.g. 23/11/2026 23:00 น.)
 */
export function formatDateTime(raw: string | Date | null | undefined, withUnit = true): string {
  const d = parseDate(raw);
  if (!d) return '—';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  const unit = withUnit ? ' น.' : '';
  return `${day}/${month}/${year} ${hours}:${minutes}${unit}`;
}

/**
 * Standard Thai date format: 23 พ.ย. 2026 [23:00 น.]
 */
export function formatThaiDate(raw: string | Date | null | undefined, includeTime = false): string {
  const d = parseDate(raw);
  if (!d) return '—';

  const day = d.getDate();
  const month = THAI_MONTH_SHORT[d.getMonth()] ?? '';
  const year = d.getFullYear();

  if (!includeTime) {
    return `${day} ${month} ${year}`;
  }

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${minutes} น.`;
}

/**
 * Standard Date-only format: DD/MM/YYYY (e.g. 23/11/2026)
 */
export function formatDateOnly(raw: string | Date | null | undefined): string {
  const d = parseDate(raw);
  if (!d) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

@Pipe({
  name: 'dateTime',
  standalone: true,
})
export class DateTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, withUnit = true): string {
    return formatDateTime(value, withUnit);
  }
}

@Pipe({
  name: 'dateThai',
  standalone: true,
})
export class DateThaiPipe implements PipeTransform {
  transform(value: string | Date | null | undefined, includeTime = false): string {
    return formatThaiDate(value, includeTime);
  }
}

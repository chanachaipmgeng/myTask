import { Size, Ticket, TicketType, Track, VarianceCode } from './models';

const TRACKS: ReadonlySet<string> = new Set(['Implement', 'RD']);
const TYPES: ReadonlySet<string> = new Set([
  'Feature',
  'CR',
  'Bug-Investigate',
  'Bug-Fix',
  'Spike',
  'Ops',
  'TechDebt',
]);
const SIZES: ReadonlySet<string> = new Set(['XS', 'S', 'M', 'L', 'XL']);
const VARIANCES: ReadonlySet<string> = new Set(['NONE', 'REQ', 'BLK', 'ENV', 'LEG']);

const REQUIRED_FIELDS = [
  'id',
  'track',
  'type',
  'module',
  'size',
  'estimateMd',
  'actualMd',
  'weekOffset',
  'reviewRounds',
  'blocker',
  'reopenCount',
  'varianceCode',
  'closed',
  'dodPassed',
  'inTimeBox',
  'childTicketsSized',
  'unplanned',
  'assigneeId',
] as const;

export interface TicketFileOptions {
  requireClosed: boolean;
  peopleIds: readonly string[];
}

export function parseClosedTicketCsv(text: string, peopleIds: readonly string[]): Ticket[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('ไฟล์ CSV ว่าง');
  }
  const headers = parseCsvLine(lines[0]);
  for (const field of REQUIRED_FIELDS) {
    if (!headers.includes(field)) {
      throw new Error(`CSV ขาดคอลัมน์ ${field}`);
    }
  }
  const tickets = lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const record: Record<string, string> = {};
    headers.forEach((header, cellIndex) => {
      record[header] = cells[cellIndex] ?? '';
    });
    return normalizeTicket(record, `แถว ${index + 2}`, { requireClosed: true, peopleIds });
  });
  return uniqueTickets(tickets);
}

export function parseClosedTicketJson(text: string, peopleIds: readonly string[]): Ticket[] {
  return uniqueTickets(parseTicketRecords(text, peopleIds, true));
}

export function parseTicketRecords(text: string, peopleIds: readonly string[], requireClosed: boolean): Ticket[] {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('JSON ไม่ถูกต้อง');
  }
  const records = ticketRecords(body);
  return records.map((record, index) =>
    normalizeTicket(record, `รายการ ${index + 1}`, { requireClosed, peopleIds }),
  );
}

export function mapTicketRecords(records: unknown, peopleIds: readonly string[], requireClosed: boolean): Ticket[] {
  return uniqueTickets(
    ticketRecords(records).map((record, index) =>
      normalizeTicket(record, `รายการ ${index + 1}`, { requireClosed, peopleIds }),
    ),
  );
}

function ticketRecords(body: unknown): unknown[] {
  if (Array.isArray(body)) {
    return body;
  }
  if (body && typeof body === 'object' && Array.isArray((body as { tickets?: unknown }).tickets)) {
    return (body as { tickets: unknown[] }).tickets;
  }
  throw new Error('ไฟล์ต้องเป็นรายการใบงาน');
}

export function normalizeTicket(raw: unknown, label: string, options: TicketFileOptions): Ticket {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${label} ไม่ใช่ใบงาน`);
  }
  const row = raw as Record<string, unknown>;
  const read = (name: string): unknown => row[name];
  const id = requiredText(read('id'), label, 'id');
  const track = oneOf(read('track'), TRACKS, label, 'track') as Track;
  const type = oneOf(read('type'), TYPES, label, 'type') as TicketType;
  const moduleName = requiredText(read('module'), label, 'module');
  const size = oneOf(read('size'), SIZES, label, 'size') as Size;
  const estimateMd = finiteNumber(read('estimateMd'), label, 'estimateMd');
  const actualMd = finiteNumber(read('actualMd'), label, 'actualMd');
  const weekOffset = finiteNumber(read('weekOffset'), label, 'weekOffset');
  const reviewRounds = finiteNumber(read('reviewRounds'), label, 'reviewRounds');
  const reopenCount = finiteNumber(read('reopenCount'), label, 'reopenCount');
  if (estimateMd < 0 || actualMd < 0 || weekOffset < 0 || reviewRounds < 0 || reopenCount < 0) {
    throw new Error(`${label} ตัวเลขต้องไม่ติดลบ`);
  }
  const varianceCode = oneOf(read('varianceCode'), VARIANCES, label, 'varianceCode') as VarianceCode;
  const closed = booleanValue(read('closed'), label, 'closed');
  if (options.requireClosed && !closed) {
    throw new Error(`${label} ยังไม่ปิด ไฟล์นำเข้ารับเฉพาะใบที่ปิดแล้ว`);
  }
  const assigneeId = textValue(read('assigneeId'));
  if (assigneeId && !options.peopleIds.includes(assigneeId)) {
    throw new Error(`${label} ไม่พบผู้รับ ${assigneeId}`);
  }
  if (closed && !assigneeId) {
    throw new Error(`${label} ปิดแล้วแต่ไม่มีผู้รับ`);
  }
  const workingDaysLeft = optionalNumber(read('workingDaysLeft'), label, 'workingDaysLeft');
  if (workingDaysLeft !== null && workingDaysLeft < 0) {
    throw new Error(`${label} วันทำการที่เหลือต้องไม่ติดลบ`);
  }
  const closedOn = textValue(read('closedOn'));
  return {
    id,
    track,
    type,
    module: moduleName,
    size,
    estimateMd,
    actualMd,
    weekOffset,
    reviewRounds: Math.round(reviewRounds),
    blocker: booleanValue(read('blocker'), label, 'blocker'),
    reopenCount: Math.round(reopenCount),
    varianceCode,
    closed,
    dodPassed: booleanValue(read('dodPassed'), label, 'dodPassed'),
    inTimeBox: booleanValue(read('inTimeBox'), label, 'inTimeBox'),
    childTicketsSized: booleanValue(read('childTicketsSized'), label, 'childTicketsSized'),
    unplanned: booleanValue(read('unplanned'), label, 'unplanned'),
    assigneeId,
    closedOn: closed && closedOn ? closedOn : null,
    workingDaysLeft,
    note: textValue(read('note')),
  };
}

function uniqueTickets(tickets: Ticket[]): Ticket[] {
  const seen = new Set<string>();
  for (const ticket of tickets) {
    if (seen.has(ticket.id)) {
      throw new Error(`รหัสซ้ำในไฟล์ ${ticket.id}`);
    }
    seen.add(ticket.id);
  }
  return tickets;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function requiredText(value: unknown, label: string, field: string): string {
  const text = textValue(value);
  if (!text) {
    throw new Error(`${label} ขาด ${field}`);
  }
  return text;
}

function textValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function oneOf(value: unknown, allowed: ReadonlySet<string>, label: string, field: string): string {
  const text = textValue(value);
  if (!allowed.has(text)) {
    throw new Error(`${label} ค่า ${field} ไม่ถูกต้อง`);
  }
  return text;
}

function finiteNumber(value: unknown, label: string, field: string): number {
  const number = typeof value === 'number' ? value : Number(textValue(value));
  if (!Number.isFinite(number)) {
    throw new Error(`${label} ค่า ${field} ต้องเป็นตัวเลข`);
  }
  return number;
}

function optionalNumber(value: unknown, label: string, field: string): number | null {
  if (value === undefined || value === null || textValue(value) === '') {
    return null;
  }
  return finiteNumber(value, label, field);
}

function booleanValue(value: unknown, label: string, field: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  const text = textValue(value).toLowerCase();
  if (['true', 'yes', 'y', '1', 'ใช่'].includes(text)) {
    return true;
  }
  if (['false', 'no', 'n', '0', 'ไม่', ''].includes(text)) {
    return false;
  }
  throw new Error(`${label} ค่า ${field} ต้องเป็นใช่หรือไม่`);
}

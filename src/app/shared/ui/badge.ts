export type BadgeTone =
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'primary'
  | 'secondary'
  | 'teal'
  | 'violet'
  | 'coral'
  | 'indigo';

/** @deprecated ใช้ BadgeTone — คง alias เพื่อไม่พัง import เดิมของ KPI */
export type KpiBadgeTone = BadgeTone;

const TONE_CLASS: Record<BadgeTone, string> = {
  info: 'e-badge-info',
  success: 'e-badge-success',
  warning: 'e-badge-warning',
  danger: 'e-badge-danger',
  primary: 'e-badge-primary',
  secondary: 'e-badge-secondary',
  teal: 'e-badge-teal',
  violet: 'e-badge-violet',
  coral: 'e-badge-coral',
  indigo: 'e-badge-indigo',
};

export function badgeToneClass(tone: BadgeTone = 'info', pill = true): string {
  const base = `e-badge ${TONE_CLASS[tone] ?? TONE_CLASS.info}`;
  return pill ? `${base} e-badge-pill` : base;
}

export function resolveBadgeTone(
  value: string | boolean | null | undefined,
  toneMap?: Record<string, BadgeTone> | null,
  fallback: BadgeTone = 'info',
): BadgeTone {
  if (typeof value === 'boolean') {
    return value ? 'success' : 'danger';
  }
  if (value == null || value === '') {
    return fallback;
  }
  const key = String(value);
  if (toneMap && toneMap[key]) {
    return toneMap[key];
  }
  return fallback;
}

/** สถานะ workflow บน Board / Work List — แยกสีแต่ละขั้นตอนชัดเจนไม่ชนกัน */
export const workflowStatusToneMap: Record<string, BadgeTone> = {
  Backlog: 'secondary',
  'In Progress': 'primary',
  'Code Review': 'violet',
  'Ready for QA': 'coral',
  'In QA': 'info',
  Reopened: 'danger',
  Done: 'success',
  Blocked: 'danger',
  blocked: 'danger',
};

/** ป้ายแผนงาน (Work List) */
export const planToneMap: Record<string, BadgeTone> = {
  ในแผน: 'teal',
  นอกแผน: 'warning',
};

/** ป้ายสัปดาห์แบบคงที่ (Tickets) */
export const weekToneMap: Record<string, BadgeTone> = {
  ตรงสัปดาห์: 'success',
  'เลื่อน 1': 'warning',
  'เลื่อน 2+': 'danger',
};

/** สายงานครบทั้ง 6 สายงาน + alias */
export const trackToneMap: Record<string, BadgeTone> = {
  IMP: 'primary',
  Implement: 'primary',
  RND: 'teal',
  'R&D': 'teal',
  RD: 'teal',
  'R&D (FE / BE / AI)': 'teal',
  QA: 'info',
  'QA / Tester': 'info',
  UXBA: 'violet',
  'Product / BA / UX': 'violet',
  SUP: 'warning',
  'Support / Helpdesk': 'warning',
  INFRA: 'coral',
  'Infra / DevOps / Sec': 'coral',
};

/** ชนิดใบงาน (Ticket Type & OpenProject Dynamic Type) */
export const ticketTypeToneMap: Record<string, BadgeTone> = {
  Feature: 'primary',
  CR: 'indigo',
  Spike: 'violet',
  Ops: 'coral',
  TechDebt: 'warning',
  'Bug-Investigate': 'danger',
  'Bug-Fix': 'danger',
};

/** คำนวณโทนป้ายสำหรับชนิดใบงานทั้งแบบมาตรฐานและชื่อจริงที่ดึงมาจาก OpenProject */
export function toneForTicketType(label: string | null | undefined): BadgeTone {
  const v = (label ?? '').trim();
  if (!v) return 'secondary';
  if (v in ticketTypeToneMap) return ticketTypeToneMap[v]!;
  const lower = v.toLowerCase();
  if (/bug|defect|incident|hotfix|error/i.test(lower)) return 'danger';
  if (/custom|cr\b|change/i.test(lower)) return 'indigo';
  if (/spike|wish|poc|research/i.test(lower)) return 'violet';
  if (/service|support|ops|customer|internal\s*rq/i.test(lower)) return 'coral';
  if (/milestone/i.test(lower)) return 'teal';
  if (/debt|refactor/i.test(lower)) return 'warning';
  return 'primary';
}

/** ระดับประสบการณ์ (Seniority Level) */
export const levelToneMap: Record<string, BadgeTone> = {
  Senior: 'violet',
  Mid: 'teal',
  Junior: 'info',
  FirstMonth: 'warning',
  เดือนแรก: 'warning',
};

/** ขนาดใบงาน (T-shirt Size) */
export const sizeToneMap: Record<string, BadgeTone> = {
  XS: 'teal',
  S: 'info',
  M: 'primary',
  L: 'violet',
  XL: 'coral',
};

/** ใช่/ไม่ — ทั่วไป */
export const yesNoToneMap: Record<string, BadgeTone> = {
  ใช่: 'success',
  ไม่: 'secondary',
};

export const blockerToneMap: Record<string, BadgeTone> = {
  ใช่: 'danger',
  ไม่: 'success',
};

export const closedToneMap: Record<string, BadgeTone> = {
  ใช่: 'success',
  ไม่: 'secondary',
};

export const dodToneMap: Record<string, BadgeTone> = {
  ใช่: 'success',
  ไม่: 'danger',
};

export const unplannedYesNoToneMap: Record<string, BadgeTone> = {
  ใช่: 'warning',
  ไม่: 'teal',
};

/** ป้ายสัปดาห์แบบไดนามิก เช่น `เลื่อน +2` บน Work List */
export function toneForWeekLabel(label: string): BadgeTone {
  if (!label || label === 'ตรงสัปดาห์') {
    return 'success';
  }
  if (label === 'เลื่อน 2+' || /เลื่อน \+?[2-9]/.test(label)) {
    return 'danger';
  }
  return 'warning';
}

/** แจ้งเตือนในแถว — `—` = ไม่มี */
export function toneForAlertLabel(label: string): BadgeTone {
  if (!label || label === '—') return 'secondary';
  if (label.includes('เลย') || label.includes('เกิน') || label.includes('ครบกำหนด')) {
    return 'danger';
  }
  return 'warning';
}

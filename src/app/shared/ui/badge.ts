export type BadgeTone = 'info' | 'success' | 'warning' | 'danger' | 'primary' | 'secondary';

/** @deprecated ใช้ BadgeTone — คง alias เพื่อไม่พัง import เดิมของ KPI */
export type KpiBadgeTone = BadgeTone;

const TONE_CLASS: Record<BadgeTone, string> = {
  info: 'e-badge-info',
  success: 'e-badge-success',
  warning: 'e-badge-warning',
  danger: 'e-badge-danger',
  primary: 'e-badge-primary',
  secondary: 'e-badge-secondary',
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
  if (toneMap && toneMap[String(value)]) {
    return toneMap[String(value)];
  }
  return fallback;
}

/** สถานะ workflow บน Board / Work List */
export const workflowStatusToneMap: Record<string, BadgeTone> = {
  Backlog: 'secondary',
  'In Progress': 'primary',
  'Code Review': 'warning',
  'Ready for QA': 'info',
  'In QA': 'info',
  Reopened: 'danger',
  Done: 'success',
  Blocked: 'danger',
  blocked: 'danger',
};

/** ป้ายแผนงาน (Work List) */
export const planToneMap: Record<string, BadgeTone> = {
  ในแผน: 'success',
  นอกแผน: 'warning',
};

/** ป้ายสัปดาห์แบบคงที่ (Tickets) */
export const weekToneMap: Record<string, BadgeTone> = {
  ตรงสัปดาห์: 'success',
  'เลื่อน 1': 'warning',
  'เลื่อน 2+': 'danger',
};

/** สายงาน */
export const trackToneMap: Record<string, BadgeTone> = {
  Implement: 'primary',
  'R&D': 'info',
  RD: 'info',
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
  ไม่: 'success',
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
  return !label || label === '—' ? 'secondary' : 'danger';
}

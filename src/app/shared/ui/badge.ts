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

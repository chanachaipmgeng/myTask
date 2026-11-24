import { Track, TrackCode, normalizeTrack } from './models';

/**
 * MyHR Prism — 8-Hue Semantic & Data-Visualization Spectrum
 * Keeps Corporate Royal Blue (#2746b3 / #3b82f6) as brand anchor
 * while providing distinct, WCAG-accessible accents across tracks, stages, and charts.
 */
export const PRISM_CHART_PALETTE_LIGHT: readonly string[] = [
  '#2746b3', // 1. Corporate Royal Blue (Brand / Primary / IMP)
  '#0d9488', // 2. Ocean Teal (Throughput / Git / RND)
  '#f59e0b', // 3. Warm Amber (MD Mandate / Unplanned / SUP)
  '#7c3aed', // 4. Electric Violet (AI Coach / OLS / UXBA)
  '#10b981', // 5. Emerald (Done / FTR Pass)
  '#e11d48', // 6. Crimson Rose (Blocked / Reopened)
  '#0284c7', // 7. Sky Cyan (QA / Testing / Info)
  '#ea580c', // 8. Sunset Coral (Ready for QA / SLA / INFRA)
] as const;

export const PRISM_CHART_PALETTE_DARK: readonly string[] = [
  '#4f73f0', // 1. Luminous Royal Blue
  '#14b8a6', // 2. Luminous Ocean Teal
  '#fbbf24', // 3. Luminous Amber
  '#a855f7', // 4. Luminous Violet
  '#34d399', // 5. Luminous Emerald
  '#fb7185', // 6. Luminous Rose
  '#38bdf8', // 7. Luminous Sky Cyan
  '#fb923c', // 8. Luminous Sunset Coral
] as const;

const TRACK_HEX_LIGHT: Record<TrackCode, string> = {
  IMP: '#2746b3',
  RND: '#0d9488',
  QA: '#0284c7',
  UXBA: '#7c3aed',
  SUP: '#d97706',
  INFRA: '#ea580c',
};

const TRACK_HEX_DARK: Record<TrackCode, string> = {
  IMP: '#4f73f0',
  RND: '#2dd4bf',
  QA: '#38bdf8',
  UXBA: '#a78bfa',
  SUP: '#fbbf24',
  INFRA: '#fb923c',
};

export function resolveTrackCodeFromAny(raw: Track | string | null | undefined): TrackCode {
  if (!raw) return 'IMP';
  const s = String(raw).trim();
  const upper = s.toUpperCase();
  if (upper === 'RND' || upper === 'RD' || upper.startsWith('R&D')) return 'RND';
  if (upper === 'QA' || upper.startsWith('QA ')) return 'QA';
  if (upper === 'UXBA' || upper.includes('UX') || upper.includes('BA') || upper.includes('PRODUCT')) return 'UXBA';
  if (upper === 'SUP' || upper.includes('SUPPORT') || upper.includes('HELPDESK')) return 'SUP';
  if (upper === 'INFRA' || upper.includes('DEVOPS')) return 'INFRA';
  if (upper === 'IMP' || upper.startsWith('IMPLEMENT')) return 'IMP';
  return normalizeTrack(s);
}

export function trackHexColor(track: Track | string | null | undefined, isDark = false): string {
  const code = resolveTrackCodeFromAny(track);
  return isDark ? TRACK_HEX_DARK[code] : TRACK_HEX_LIGHT[code];
}

export function workflowStageHexColor(status: string | null | undefined, isDark = false): string {
  const key = String(status ?? '').trim().toLowerCase();
  if (key.includes('done') || key.includes('closed') || key.includes('เสร็จ')) {
    return isDark ? '#34d399' : '#10b981';
  }
  if (key.includes('block') || key.includes('reopen') || key.includes('ติด')) {
    return isDark ? '#fb7185' : '#e11d48';
  }
  if (key.includes('review') || key.includes('รีวิว')) {
    return isDark ? '#a855f7' : '#7c3aed';
  }
  if (key.includes('ready') || key.includes('รอทดสอบ')) {
    return isDark ? '#fb923c' : '#ea580c';
  }
  if (key.includes('qa') || key.includes('ทดสอบ')) {
    return isDark ? '#38bdf8' : '#0284c7';
  }
  if (key.includes('progress') || key.includes('พัฒนา')) {
    return isDark ? '#4f73f0' : '#2746b3';
  }
  return isDark ? '#94a3b8' : '#64748b';
}

export function scoreBandHexColor(score: number, target = 75, isDark = false): string {
  if (!Number.isFinite(score)) return isDark ? '#64748b' : '#94a3b8';
  if (score >= 85) return isDark ? '#34d399' : '#10b981';
  if (score >= target) return isDark ? '#2dd4bf' : '#0d9488';
  if (score >= 60) return isDark ? '#fbbf24' : '#f59e0b';
  return isDark ? '#fb7185' : '#e11d48';
}

export function wipLoadHexColor(openMd: number, isDark = false): string {
  if (openMd <= 2.5) return isDark ? '#34d399' : '#10b981';
  if (openMd <= 4.0) return isDark ? '#4f73f0' : '#2746b3';
  if (openMd <= 5.5) return isDark ? '#fbbf24' : '#f59e0b';
  return isDark ? '#fb7185' : '#e11d48';
}

import { Track } from './models';

/** โหมด Team Staging — `rd` = POC เฉพาะ R&D, `all` = ทุกทีม */
export type OpenProjectTeamStaging = 'rd' | 'all';

export function parseTeamStaging(raw: string | undefined | null): OpenProjectTeamStaging {
  const v = (raw ?? 'all').trim().toLowerCase();
  return v === 'rd' ? 'rd' : 'all';
}

export interface DepartmentTeamMap {
  teamId: string;
  teamName: string;
  track: Track;
  /** true เมื่อแผนกถือเป็น R&D ตามกฎ staging */
  isRd: boolean;
}

/** สร้าง slug สำหรับชื่อทีม/แผนกจาก myProject (รองรับภาษาไทยและอังกฤษ) */
export function slugifyTeamName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'unassigned';
  }
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'other';
}

/**
 * แมปชื่อแผนกจริงจาก OpenProject (customField1 / customField2 / customField3) → teamId/teamName ตามชื่อจริงใน myProject
 * พร้อมจำแนกสายงาน 6 สาย (IMP, RND/RD, QA, UXBA, SUP, INFRA) จากแผนก/ฝ่ายย่อย/ตำแหน่งจริง
 */
export function mapDepartmentToTeam(
  department: string | null | undefined,
  unit?: string | null,
  jobTitle?: string | null,
): DepartmentTeamMap {
  const raw = (department ?? '').trim();
  const lower = raw.toLowerCase();
  const combined = `${raw} ${unit ?? ''} ${jobTitle ?? ''}`.toLowerCase();
  if (!raw) {
    return { teamId: 'unassigned', teamName: 'ยังไม่ระบุทีม', track: 'Implement', isRd: false };
  }
  const isRd =
    raw.startsWith('RD-') ||
    lower.includes('research') ||
    lower === 'r&d' ||
    lower.includes('r&d');

  let track: Track = isRd ? 'RD' : 'Implement';
  if (
    /\bqa\b|quality assurance|tester|testing/i.test(combined)
  ) {
    track = 'QA';
  } else if (
    /\bux\b|\bui\b|business analyst|\bba\b|product owner|product design/i.test(combined)
  ) {
    track = 'UXBA';
  } else if (
    /^se-|system engineer|devops|infra|network|security|cloud/i.test(combined)
  ) {
    track = 'INFRA';
  } else if (
    /^cs-|customer service|helpdesk|call center|support/i.test(combined)
  ) {
    track = 'SUP';
  }

  return {
    teamId: slugifyTeamName(raw),
    teamName: raw,
    track,
    isRd,
  };
}

/**
 * แปลงลิงก์รูปโปรไฟล์จาก OpenProject ให้ใช้รูปแบบ API v3 มาตรฐานเสมอ:
 * เช่น `https://myprojectplus.myhr.co.th/users/90/avatar` -> `https://myprojectplus.myhr.co.th/api/v3/users/90/avatar`
 */
export function normalizeOpenProjectAvatarUrl(
  rawUrl: string | null | undefined,
  opUserId?: number | null,
  baseUrl?: string | null,
): string | null {
  const trimmed = (rawUrl ?? '').trim();
  if (trimmed) {
    const legacyMatch = /^(https?:\/\/[^/]+)\/users\/(\d+)\/avatar\/?$/i.exec(trimmed);
    if (legacyMatch) {
      return `${legacyMatch[1]}/api/v3/users/${legacyMatch[2]}/avatar`;
    }
    return trimmed;
  }
  if (opUserId != null && Number.isFinite(opUserId) && baseUrl?.trim()) {
    return `${baseUrl.trim().replace(/\/+$/, '')}/api/v3/users/${opUserId}/avatar`;
  }
  return null;
}

/** ดึงหมายเลขผู้ใช้ OpenProject จาก URL รูปโปรไฟล์ทั้งแบบ `/api/v3/users/90/avatar` และ `/users/90/avatar` */
export function extractOpAvatarUserId(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = /\/(?:api\/v3\/)?users\/(\d+)\/avatar/i.exec(url.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * ป้ายทีม — ใช้ชื่อจากตาราง teams/departments ก่อน · stub เก่าเฉพาะ offline/seed
 */
export function teamLabelForId(
  teamId: string,
  teams?: readonly { id: string; name?: string | null }[],
): string {
  const fromTeams = teams?.find((t) => t.id === teamId)?.name?.trim();
  if (fromTeams) {
    return fromTeams;
  }
  switch (teamId) {
    case 'rd':
      return 'ทีม R&D';
    case 'implement':
      return 'ทีม Implement';
    case 'qa':
      return 'ทีม QA';
    case 'uxba':
      return 'ทีม UX/BA';
    case 'infra':
      return 'ทีม Infra';
    case 'support':
      return 'ทีม Support';
    case 'unassigned':
      return 'ยังไม่ระบุทีม';
    default:
      // slug จาก myProject เช่น rd-research-and-development → อ่านง่ายขึ้นเล็กน้อย
      return teamId.replace(/-/g, ' ');
  }
}

/** คนควร active หรือไม่ตามโหมด staging + สถานะ OP */
export function isPersonActiveForStaging(
  staging: OpenProjectTeamStaging,
  opts: { isRd: boolean; locked: boolean },
): boolean {
  if (opts.locked) {
    return false;
  }
  if (staging === 'all') {
    return true;
  }
  return opts.isRd;
}

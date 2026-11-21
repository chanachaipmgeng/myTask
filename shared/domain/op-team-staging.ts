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
 * แมปชื่อแผนกจริงจาก OpenProject (customField1) → teamId/teamName ตามชื่อจริงใน myProject
 * โดยยังคงคำนวณ track (RD/Implement) และ isRd สำหรับสูตรคะแนนและกฎ staging
 */
export function mapDepartmentToTeam(department: string | null | undefined): DepartmentTeamMap {
  const raw = (department ?? '').trim();
  const lower = raw.toLowerCase();
  if (!raw) {
    return { teamId: 'unassigned', teamName: 'ยังไม่ระบุทีม', track: 'Implement', isRd: false };
  }
  const isRd =
    raw.startsWith('RD-') ||
    lower.includes('research') ||
    lower === 'r&d' ||
    lower.includes('r&d');
  return {
    teamId: slugifyTeamName(raw),
    teamName: raw,
    track: isRd ? 'RD' : 'Implement',
    isRd,
  };
}

export function teamLabelForId(teamId: string): string {
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
      return teamId;
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

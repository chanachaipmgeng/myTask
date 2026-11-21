import { Track } from './models';

/** โหมด Team Staging — `rd` = POC เฉพาะ R&D, `all` = ทุกทีม */
export type OpenProjectTeamStaging = 'rd' | 'all';

export function parseTeamStaging(raw: string | undefined | null): OpenProjectTeamStaging {
  const v = (raw ?? 'rd').trim().toLowerCase();
  return v === 'all' ? 'all' : 'rd';
}

export interface DepartmentTeamMap {
  teamId: string;
  track: Track;
  /** true เมื่อแผนกถือเป็น R&D ตามกฎ staging */
  isRd: boolean;
}

/**
 * แมปชื่อแผนกจาก OpenProject (customField1) → teamId + track คู่ Implement/RD
 * (DB people.track ยังจำกัดสองค่า — สาย QA/UXBA ฯลฯ เก็บใน teamId)
 */
export function mapDepartmentToTeam(department: string | null | undefined): DepartmentTeamMap {
  const raw = (department ?? '').trim();
  const lower = raw.toLowerCase();
  if (!raw) {
    return { teamId: 'unassigned', track: 'Implement', isRd: false };
  }
  if (raw.startsWith('RD-') || lower.includes('research') || lower === 'r&d' || lower.includes('r&d')) {
    return { teamId: 'rd', track: 'RD', isRd: true };
  }
  if (lower.includes('qa') || lower.includes('quality') || lower.includes('test')) {
    return { teamId: 'qa', track: 'Implement', isRd: false };
  }
  if (lower.includes('ux') || lower.includes('ba') || lower.includes('design') || lower.includes('product')) {
    return { teamId: 'uxba', track: 'Implement', isRd: false };
  }
  if (lower.includes('infra') || lower.includes('devops') || lower.includes('sre') || lower.includes('platform')) {
    return { teamId: 'infra', track: 'Implement', isRd: false };
  }
  if (lower.includes('support') || lower.includes('helpdesk') || lower.includes('service desk')) {
    return { teamId: 'support', track: 'Implement', isRd: false };
  }
  if (
    lower.includes('implement') ||
    lower.includes('develop') ||
    lower.includes('software') ||
    lower.includes('engineering') ||
    lower.includes('dev')
  ) {
    return { teamId: 'implement', track: 'Implement', isRd: false };
  }
  // แผนกอื่น — ใช้ slug จากชื่อแผนกเป็น teamId
  const slug =
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'other';
  return { teamId: slug, track: 'Implement', isRd: false };
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

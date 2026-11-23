import { mapDepartmentToTeam } from './op-team-staging';

export interface TeamVisibilityRule {
  sourceTeamId: string;
  targetTeamId: string;
}

export interface VisibilityConfig {
  matrix: TeamVisibilityRule[];
  userOverrides: Record<string, string[]>;
}

/** ดึง teamId ของพนักงานจาก teamId หรือแผนก myProject */
export function resolvePersonTeamId(person: {
  teamId?: string | null;
  department?: string | null;
}): string {
  if (person.teamId?.trim()) {
    return person.teamId.trim();
  }
  return mapDepartmentToTeam(person.department).teamId;
}

/**
 * คำนวณรายชื่อทีมที่ผู้ใช้มีสิทธิ์มองเห็น (Allowed Teams)
 * คืนค่า null หากเป็น Admin (เห็นได้ทุกทีมแบบไม่จำกัด)
 * หรือคืนค่า string[] รายชื่อ teamId ที่ได้รับอนุญาต
 */
export function computeEffectiveAllowedTeams(
  user: {
    id: string;
    access?: string;
    teamId?: string | null;
    department?: string | null;
  } | null | undefined,
  config: VisibilityConfig,
): string[] | null {
  if (!user || user.access === 'admin') {
    return null; // Admin sees everything
  }

  const ownTeam = resolvePersonTeamId(user);
  const set = new Set<string>();

  if (ownTeam && ownTeam !== 'unassigned') {
    set.add(ownTeam);
  }

  // 1. เพิ่มทีมที่อนุญาตจาก Team Matrix (ความสัมพันธ์ระดับแผนก)
  if (config.matrix?.length) {
    for (const rule of config.matrix) {
      if (rule.sourceTeamId === ownTeam) {
        set.add(rule.targetTeamId);
      }
    }
  }

  // 2. เพิ่มทีมที่อนุญาตพิเศษระดับบุคคล (User Overrides)
  const overrides = config.userOverrides?.[user.id] ?? [];
  for (const t of overrides) {
    if (t?.trim()) {
      set.add(t.trim());
    }
  }

  return Array.from(set);
}

/** ตรวจสอบว่า teamId อยู่ในสิทธิ์หรือไม่ */
export function isTeamAllowed(
  allowedTeams: string[] | null,
  teamId: string | null | undefined,
): boolean {
  if (allowedTeams === null) {
    return true; // unrestricted (Admin)
  }
  if (!teamId) {
    return false;
  }
  return allowedTeams.includes(teamId);
}

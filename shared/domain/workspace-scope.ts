import { Person, Team, Ticket, Track, TrackCode, normalizeTrack } from './models';
import { ScorecardCycle, ticketInDateRange } from './scorecard-cycle';
import { teamLabelForId } from './op-team-staging';
import { resolvePersonTeamId, resolveProjectKey, resolveTeamLabel } from './work-views';

/** All หรือรหัสสาย (รองรับ alias Implement/RD) */
export type WorkspaceTrackFilter = 'All' | Track | TrackCode;

const TRACK_FILTER_CODES: readonly TrackCode[] = ['IMP', 'RND', 'QA', 'UXBA', 'SUP', 'INFRA'];

/** ชิปสายงานมาตรฐาน 6 สาย (+ ทั้งหมด) */
export function listWorkspaceTrackChipOptions(): { id: string; label: string }[] {
  const shortLabel = (code: TrackCode): string => {
    switch (code) {
      case 'IMP':
        return 'Implement';
      case 'RND':
        return 'R&D';
      case 'QA':
        return 'QA';
      case 'UXBA':
        return 'Product';
      case 'SUP':
        return 'Support';
      case 'INFRA':
        return 'Infra';
    }
  };
  return [
    { id: 'All', label: 'ทั้งหมด' },
    ...TRACK_FILTER_CODES.map((code) => ({ id: code, label: shortLabel(code) })),
  ];
}

export function parseWorkspaceTrackFilter(raw: string | null | undefined): WorkspaceTrackFilter {
  const value = (raw ?? '').trim();
  if (!value || value === 'All') {
    return 'All';
  }
  if (
    value === 'Implement' ||
    value === 'RD' ||
    value === 'IMP' ||
    value === 'RND' ||
    value === 'QA' ||
    value === 'UXBA' ||
    value === 'SUP' ||
    value === 'INFRA'
  ) {
    return value;
  }
  return 'All';
}

export function trackMatchesFilter(track: Track | string | null | undefined, filter: WorkspaceTrackFilter): boolean {
  if (!filter || filter === 'All') {
    return true;
  }
  return normalizeTrack(track) === normalizeTrack(filter);
}

export interface WorkspaceScope {
  teamId?: string;
  opProject?: string;
  track?: WorkspaceTrackFilter;
  personId?: string;
  /** รหัสรอบประเมิน */
  cycleId?: string;
  /** รวมวันเริ่ม YYYY-MM-DD */
  fromDate?: string;
  /** รวมวันสิ้นสุด YYYY-MM-DD */
  toDate?: string;
  /** ปี ค.ศ. ทางลัด (ถ้าไม่มี from/to จะใช้ทั้งปี) */
  yearCe?: number | null;
}

export function listOrgTeamOptions(
  people: readonly Person[],
  teams: readonly Team[] = [],
): { id: string; label: string }[] {
  const map = new Map<string, string>();
  for (const team of teams) {
    const id = team.id?.trim();
    if (!id) continue;
    map.set(id, team.name?.trim() || teamLabelForId(id));
  }
  for (const person of people) {
    if (person.active === false) continue;
    const id = resolvePersonTeamId(person);
    if (!map.has(id)) {
      map.set(id, resolveTeamLabel(id, person));
    }
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'th'));
}

/** สรุปการ์ดทีมสำหรับ Hub `/org/teams` */
export interface TeamWorkspaceCard {
  id: string;
  name: string;
  departmentId: string;
  leadId: string | null;
  leadName: string;
  memberCount: number;
  trackSummary: string;
}

export function listTeamWorkspaceCards(
  people: readonly Person[],
  teams: readonly Team[] = [],
): TeamWorkspaceCard[] {
  const options = listOrgTeamOptions(people, teams);
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const peopleById = new Map(people.map((person) => [person.id, person]));

  return options.map((row) => {
    const team = teamById.get(row.id);
    const members = people.filter(
      (person) => person.active !== false && resolvePersonTeamId(person) === row.id,
    );
    const trackCounts = new Map<string, number>();
    for (const person of members) {
      const label = person.track === 'RD' || person.track === 'RND' ? 'R&D' : String(person.track);
      trackCounts.set(label, (trackCounts.get(label) ?? 0) + 1);
    }
    const trackSummary =
      [...trackCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => `${label} ${count}`)
        .join(' · ') || 'ยังไม่มีสมาชิก';
    const leadId = team?.leadId ?? null;
    const lead = leadId ? peopleById.get(leadId) : undefined;
    return {
      id: row.id,
      name: team?.name?.trim() || row.label,
      departmentId: team?.departmentId ?? '',
      leadId,
      leadName: lead?.nickname || lead?.fullName || (leadId ? leadId : 'ยังไม่ระบุ Lead'),
      memberCount: members.length,
      trackSummary,
    };
  });
}

export function peopleIdsForTeam(people: readonly Person[], teamId: string): Set<string> | null {
  const id = teamId.trim();
  if (!id) {
    return null;
  }
  return new Set(
    people.filter((person) => person.active !== false && resolvePersonTeamId(person) === id).map((p) => p.id),
  );
}

export function resolveWorkspaceTeamAllowlist(
  scope: WorkspaceScope,
  cycle?: ScorecardCycle | null,
): Set<string> | null {
  const explicit = scope.teamId?.trim() ?? '';
  if (explicit) {
    return new Set([explicit]);
  }
  const fromCycle = (cycle?.teamIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (fromCycle.length === 0) {
    return null;
  }
  return new Set(fromCycle);
}

export function resolveWorkspaceDateRange(
  scope: WorkspaceScope,
  cycle?: ScorecardCycle | null,
): { fromDate: string; toDate: string } | null {
  let from = scope.fromDate?.trim() ?? '';
  let to = scope.toDate?.trim() ?? '';
  if (!from && !to && typeof scope.yearCe === 'number' && Number.isFinite(scope.yearCe)) {
    const y = Math.trunc(scope.yearCe);
    from = `${y}-01-01`;
    to = `${y}-12-31`;
  }
  if (!from && cycle?.startOn) {
    from = cycle.startOn;
  }
  if (!to && cycle?.endOn) {
    to = cycle.endOn;
  }
  if (!from && !to) {
    return null;
  }
  return { fromDate: from, toDate: to };
}

export function filterPeopleByWorkspace(
  people: readonly Person[],
  scope: WorkspaceScope,
  cycle?: ScorecardCycle | null,
): Person[] {
  const teamAllow = resolveWorkspaceTeamAllowlist(scope, cycle);
  const trackFilter = scope.track && scope.track !== 'All' ? scope.track : 'All';
  const personId = scope.personId?.trim() ?? '';
  return people.filter((person) => {
    if (person.active === false) {
      return false;
    }
    if (personId && person.id !== personId) {
      return false;
    }
    if (teamAllow && !teamAllow.has(resolvePersonTeamId(person))) {
      return false;
    }
    if (!trackMatchesFilter(person.track, trackFilter)) {
      return false;
    }
    return true;
  });
}

export function filterTicketsByWorkspace(
  tickets: readonly Ticket[],
  people: readonly Person[],
  scope: WorkspaceScope,
  cycle?: ScorecardCycle | null,
): Ticket[] {
  const teamAllow = resolveWorkspaceTeamAllowlist(scope, cycle);
  const peopleInTeams = teamAllow
    ? new Set(
        people
          .filter((person) => person.active !== false && teamAllow.has(resolvePersonTeamId(person)))
          .map((p) => p.id),
      )
    : null;
  const trackFilter = scope.track && scope.track !== 'All' ? scope.track : 'All';
  const personId = scope.personId?.trim() ?? '';
  const opProject = scope.opProject?.trim() ?? '';
  const range = resolveWorkspaceDateRange(scope, cycle);
  return tickets.filter((ticket) => {
    if (!trackMatchesFilter(ticket.track, trackFilter)) {
      return false;
    }
    if (personId && ticket.assigneeId !== personId) {
      return false;
    }
    if (opProject) {
      const key = resolveProjectKey(ticket);
      if (key !== opProject) {
        return false;
      }
    }
    if (peopleInTeams) {
      if (!ticket.assigneeId || !peopleInTeams.has(ticket.assigneeId)) {
        return false;
      }
    }
    if (range && !ticketInDateRange(ticket, range.fromDate, range.toDate)) {
      return false;
    }
    return true;
  });
}

import { AccessRole, Department, Level, Person, Team, Ticket, Track } from '../../../shared/domain/models';
import { ScorecardCycleSettings } from '../../../shared/domain/scorecard-cycle';
import { TrackWeights } from '../../../shared/domain/scoring';
import { OpenProjectMapping } from '../integrations/openproject/openproject.mapper';

export interface AlertRulesSetting {
  deadline: boolean;
  overrun: boolean;
  overrunLimit: number;
}

export interface OpenProjectCatalogEntry {
  id: number;
  identifier: string;
  name: string;
  active: boolean;
  assignedTeamIds?: string[];
  gitRepoIds?: string[];
  gitRepoNames?: string[];
  /** Open / WIP tickets (list API only). */
  activeTicketsCount?: number;
  /** All tickets linked to this project (list API only). */
  totalTickets?: number;
  /** Closed tickets (list API only). */
  closedTicketsCount?: number;
  /** 0–100 from closed MD or closed/total count (list API only). */
  progressPercent?: number;
  /** Up to 5 distinct open-ticket assignees (list API only). */
  sampleAssigneeIds?: string[];
  /** Earliest open firstDueOn/dueOn ISO day (list API only). */
  nextDueOn?: string | null;
}

export interface OpenProjectTypeCatalogEntry {
  id: number;
  name: string;
  color?: string;
  isMilestone?: boolean;
}

export interface OpenProjectStatusCatalogEntry {
  id: number;
  name: string;
  isClosed: boolean;
  color?: string;
}

export interface OpenProjectCustomFieldCatalogEntry {
  key: string;
  name: string;
  type: string;
  sampleWpType?: string;
  options?: { id?: number; name: string }[];
}

export interface OpenProjectEnumerationCatalogEntry {
  id: number;
  name: string;
  type: string;
  active: boolean;
  color?: string;
}

export interface OpenProjectGroupCatalogEntry {
  id: number;
  name: string;
  memberCount?: number;
}

export interface AppSettings {
  weeklyQuotas: Record<Level, number>;
  trackWeights: TrackWeights;
  alertRules: AlertRulesSetting;
  levelOverrides: Record<string, Level>;
  hoursPerMd: number;
  openprojectMapping: OpenProjectMapping;
  /** Snapshot โปรเจกต์จาก discovery — ใช้เป็น dropdown แม้ยังไม่มีใบซิงก์ */
  openprojectProjectCatalog: OpenProjectCatalogEntry[];
  /** Snapshot ชนิดใบงานจริงจาก OpenProject (`/api/v3/types`) */
  openprojectTypeCatalog?: OpenProjectTypeCatalogEntry[];
  /** Snapshot สถานะจริงจาก OpenProject (`/api/v3/statuses`) */
  openprojectStatusCatalog?: OpenProjectStatusCatalogEntry[];
  /** Snapshot Custom Fields จาก schema discovery */
  openprojectCustomFieldCatalog?: OpenProjectCustomFieldCatalogEntry[];
  /** Snapshot Enumerations / Priorities / Activities */
  openprojectEnumerationCatalog?: OpenProjectEnumerationCatalogEntry[];
  /** Snapshot Groups จาก `/api/v3/groups` */
  openprojectGroupCatalog?: OpenProjectGroupCatalogEntry[];
  /**
   * กลุ่ม OpenProject ที่ถือเป็น roster — เมื่อไม่ว่าง sync-users จะตั้ง
   * people.active ตามสมาชิกในกลุ่มเหล่านี้ (และไม่ locked)
   */
  openprojectRosterGroupIds?: number[];
  /** รอบประเมินปี/ช่วงวัน + ขอบเขตทีม */
  scorecardCycles: ScorecardCycleSettings;
}

export interface PersonRow {
  id: string;
  nickname: string;
  full_name: string;
  role_title: string;
  level: Level;
  track: Track;
  planned_md: string | number;
  team_id: string | null;
  access: AccessRole;
  email: string | null;
  gitlab_username: string | null;
  openproject_user_id: number | null;
  avatar_url?: string | null;
  department?: string | null;
  unit?: string | null;
  job_title?: string | null;
  active: boolean;
}

export interface WorkItemRow {
  id: string;
  source: 'local' | 'openproject';
  op_id: number | null;
  assignee_id: string;
  closed: boolean;
  closed_on: string | null;
  data: Ticket | string;
  synced_at: Date | string | null;
  updated_at: Date | string;
}

export interface DepartmentRow {
  id: string;
  name: string;
}

export interface TeamRow {
  id: string;
  department_id: string;
  name: string;
  lead_id: string | null;
}

export interface SyncRunRow {
  id: string;
  connection: string;
  trigger: 'manual' | 'schedule';
  started_by: string | null;
  started_at: Date | string;
  finished_at: Date | string | null;
  status: 'running' | 'success' | 'failed';
  added: number;
  updated: number;
  unchanged: number;
  errors: unknown;
  since: Date | string | null;
}

export interface OpUserSeenRow {
  op_user_id: number;
  name: string;
  login: string | null;
  email: string | null;
  last_seen: Date | string;
}

export interface ConnectionRow {
  id: string;
  base_url: string;
  token_enc: string | null;
  enabled: boolean;
  updated_by: string | null;
  updated_at: Date | string;
}

export function personFromRow(row: PersonRow): Person {
  return {
    id: row.id,
    nickname: row.nickname,
    fullName: row.full_name,
    role: row.role_title,
    level: row.level,
    track: row.track,
    plannedMd: Number(row.planned_md),
    teamId: row.team_id,
    access: row.access,
    email: row.email,
    gitlabUsername: row.gitlab_username,
    openprojectUserId: row.openproject_user_id,
    avatarUrl: row.avatar_url ?? null,
    department: row.department ?? null,
    unit: row.unit ?? null,
    jobTitle: row.job_title ?? null,
    active: row.active ?? true,
  };
}

export function departmentFromRow(row: DepartmentRow): Department {
  return { id: row.id, name: row.name };
}

export function teamFromRow(row: TeamRow): Team {
  return {
    id: row.id,
    departmentId: row.department_id,
    name: row.name,
    leadId: row.lead_id,
  };
}

function normalizeDateOnly(raw: Date | string | null | undefined): string | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(raw).slice(0, 10);
}

export function ticketFromRow(row: WorkItemRow): Ticket {
  const data = typeof row.data === 'string' ? (JSON.parse(row.data) as Ticket) : row.data;
  return {
    ...data,
    id: row.id,
    assigneeId: row.assignee_id,
    closed: row.closed,
    closedOn: normalizeDateOnly(row.closed_on),
    source: row.source,
    opId: row.op_id,
  };
}

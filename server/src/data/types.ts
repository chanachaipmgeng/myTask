import { AccessRole, Department, Level, Person, Team, Ticket, Track } from '../../../shared/domain/models';
import { TrackWeights } from '../../../shared/domain/scoring';
import { OpenProjectMapping } from '../integrations/openproject/openproject.mapper';

export interface AlertRulesSetting {
  deadline: boolean;
  overrun: boolean;
  overrunLimit: number;
}

export interface AppSettings {
  weeklyQuotas: Record<Level, number>;
  trackWeights: TrackWeights;
  alertRules: AlertRulesSetting;
  levelOverrides: Record<string, Level>;
  hoursPerMd: number;
  openprojectMapping: OpenProjectMapping;
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

export function ticketFromRow(row: WorkItemRow): Ticket {
  const data = typeof row.data === 'string' ? (JSON.parse(row.data) as Ticket) : row.data;
  return {
    ...data,
    id: row.id,
    assigneeId: row.assignee_id,
    closed: row.closed,
    closedOn: row.closed_on,
    source: row.source,
    opId: row.op_id,
  };
}

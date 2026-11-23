import { Injectable } from '@angular/core';
import { AnalyticsReport } from './analytics';
import { AccessRole, Department, Level, Person, Team, Ticket, Track } from './models';
import { TeamVisibilityRule, VisibilityConfig } from '../../../shared/domain/team-visibility';
import { KpiPeriodType } from './kpi-snapshot';
import { PersonScore, TrackWeights } from './scoring';
import { AlertRules } from './admin-settings';

export interface AuditLogDto {
  id: number;
  actorId: string | null;
  actorName: string;
  action: string;
  target: string | null;
  detail: string;
  createdAt: string;
}

/** Query ร่วมกับเซิร์ฟเวอร์สำหรับลิสต์ที่แบ่งหน้า */
export interface ListQueryParams {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: 'asc' | 'desc';
}

export interface ListPageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function toListQueryString(params?: ListQueryParams): string {
  if (!params) {
    return '';
  }
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (params.page != null) query.set('page', String(params.page));
  if (params.pageSize != null) query.set('pageSize', String(params.pageSize));
  if (params.sort?.trim()) query.set('sort', params.sort.trim());
  if (params.dir) query.set('dir', params.dir);
  const text = query.toString();
  return text ? `?${text}` : '';
}

export interface KpiSnapshotPeriodDto {
  periodType: KpiPeriodType;
  periodKey: string;
  capturedAt: string;
  rowCount: number;
}

export interface KpiSnapshotRowDto {
  personId: string;
  nickname: string;
  track: string;
  periodType: KpiPeriodType;
  periodKey: string;
  score: PersonScore;
  capturedAt: string;
  capturedBy: string | null;
}

export interface OpenProjectCatalogEntry {
  id: number;
  identifier: string;
  name: string;
  active: boolean;
  assignedTeamIds?: string[];
  activeTicketsCount?: number;
}

export interface BootstrapSettings {
  weeklyQuotas: Record<string, number>;
  trackWeights: TrackWeights;
  alertRules: AlertRules;
  levelOverrides: Record<string, string>;
  hoursPerMd: number;
  openprojectMapping: unknown;
  openprojectProjectCatalog?: OpenProjectCatalogEntry[];
  scorecardCycles?: {
    cycles: import('../../../shared/domain/scorecard-cycle').ScorecardCycle[];
    activeCycleId: string | null;
  };
}

export interface BootstrapResponse {
  people: Person[];
  tickets: Ticket[];
  settings: BootstrapSettings;
  departments: Department[];
  teams: Team[];
  teamStaging?: 'rd' | 'all';
  visibility?: VisibilityConfig;
  effectiveAllowedTeams?: string[] | null;
  disputes?: import('./models').TicketDispute[];
  leaves?: import('./models').EmployeeLeave[];
  stageLogs?: import('./models').TicketStageLog[];
  allocations?: import('./models').TicketAllocation[];
  auth: {
    authenticated: boolean;
    person: Person | null;
    access: AccessRole | null;
    effectiveAllowedTeams?: string[] | null;
    devLoginEnabled?: boolean;
  };
}

export interface OpenProjectIntegration {
  configured: boolean;
  enabled: boolean;
  writeback: boolean;
  teamStaging: 'rd' | 'all';
  baseUrl: string;
  hasToken: boolean;
  mapping: Record<string, unknown>;
  projectCatalog: OpenProjectCatalogEntry[];
  hoursPerMd: number;
  lastRuns: {
    id: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    added: number;
    updated: number;
    unchanged: number;
    errors: unknown;
  }[];
  unmappedUsers: {
    opUserId: number;
    name: string;
    login: string | null;
    email: string | null;
  }[];
  people: { id: string; nickname: string; openprojectUserId: number | null }[];
}

export interface SyncRunDto {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  added: number;
  updated: number;
  unchanged: number;
  errors: unknown;
}

export interface GitLabIntegration {
  configured: boolean;
  enabled: boolean;
  baseUrl: string;
  projectIds: string[];
  hasToken: boolean;
  lastRuns: SyncRunDto[];
}

export interface TeamsIntegration {
  configured: boolean;
  enabled: boolean;
  channel: string;
  hasWebhook: boolean;
  source: 'env' | 'db' | 'none';
  lastRuns: SyncRunDto[];
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${response.status} ${path}`);
  }
  return (await response.json()) as T;
}

@Injectable({ providedIn: 'root' })
export class ApiClient {
  bootstrap(): Promise<BootstrapResponse> {
    return api<BootstrapResponse>('/api/bootstrap');
  }

  createWorkItem(ticket: Omit<Ticket, 'id'> & { id?: string }): Promise<{ ok: boolean; ticket?: Ticket }> {
    return api('/api/work-items', { method: 'POST', body: JSON.stringify({ ticket }) });
  }

  importWorkItems(tickets: readonly Ticket[]): Promise<{ ok: boolean; added: string[]; skipped: string[] }> {
    return api('/api/work-items/import', { method: 'POST', body: JSON.stringify({ tickets }) });
  }

  replaceWorkItem(ticket: Ticket): Promise<{ ok: boolean; ticket?: Ticket }> {
    return api(`/api/work-items/${encodeURIComponent(ticket.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ticket }),
    });
  }

  assignWorkItem(
    ticketId: string,
    assigneeId: string,
  ): Promise<{ ok: boolean; ticket?: Ticket; writebackError?: string; message?: string }> {
    return api(`/api/work-items/${encodeURIComponent(ticketId)}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeId }),
    });
  }

  updateWorkItemDates(
    ticketId: string,
    dates: { startDate?: string | null; dueDate?: string | null },
  ): Promise<{ ok: boolean; ticket?: Ticket; writebackError?: string; message?: string }> {
    return api(`/api/work-items/${encodeURIComponent(ticketId)}/dates`, {
      method: 'POST',
      body: JSON.stringify(dates),
    });
  }

  saveSettings(settings: Partial<BootstrapSettings>): Promise<{ ok: boolean }> {
    return api('/api/settings', { method: 'PUT', body: JSON.stringify({ settings }) });
  }

  listScorecardCycles(): Promise<{
    ok: boolean;
    cycles: import('../../../shared/domain/scorecard-cycle').ScorecardCycle[];
    activeCycleId: string | null;
  }> {
    return api('/api/scorecard-cycles');
  }

  createScorecardCycle(body: Record<string, unknown>): Promise<{
    ok: boolean;
    message?: string;
    cycle?: import('../../../shared/domain/scorecard-cycle').ScorecardCycle;
    cycles?: import('../../../shared/domain/scorecard-cycle').ScorecardCycle[];
    activeCycleId?: string | null;
  }> {
    return api('/api/scorecard-cycles', { method: 'POST', body: JSON.stringify(body) });
  }

  updateScorecardCycle(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    message?: string;
    cycle?: import('../../../shared/domain/scorecard-cycle').ScorecardCycle;
    cycles?: import('../../../shared/domain/scorecard-cycle').ScorecardCycle[];
    activeCycleId?: string | null;
  }> {
    return api(`/api/scorecard-cycles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  activateScorecardCycle(id: string): Promise<{
    ok: boolean;
    message?: string;
    cycles?: import('../../../shared/domain/scorecard-cycle').ScorecardCycle[];
    activeCycleId?: string | null;
  }> {
    return api(`/api/scorecard-cycles/${encodeURIComponent(id)}/activate`, {
      method: 'POST',
      body: '{}',
    });
  }

  deleteScorecardCycle(id: string): Promise<{
    ok: boolean;
    message?: string;
    cycles?: import('../../../shared/domain/scorecard-cycle').ScorecardCycle[];
    activeCycleId?: string | null;
  }> {
    return api(`/api/scorecard-cycles/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  getOpenProject(): Promise<OpenProjectIntegration> {
    return api('/api/integrations/openproject');
  }

  saveOpenProject(body: Record<string, unknown>): Promise<OpenProjectIntegration & { ok?: boolean; errors?: string[] }> {
    return api('/api/integrations/openproject', { method: 'PUT', body: JSON.stringify(body) });
  }

  syncOpenProject(): Promise<{
    ok: boolean;
    added: number;
    updated: number;
    unchanged: number;
    errors: string[];
  }> {
    return api('/api/integrations/openproject/sync', { method: 'POST', body: '{}' });
  }

  syncOpenProjectUsers(): Promise<{
    ok: boolean;
    total: number;
    created: number;
    updated: number;
    linked: number;
    errors?: string[];
  }> {
    return api('/api/integrations/openproject/sync-users', { method: 'POST', body: '{}' });
  }

  mapOpenProjectUser(personId: string, opUserId: number | null): Promise<OpenProjectIntegration> {
    return api('/api/integrations/openproject/user-map', {
      method: 'PUT',
      body: JSON.stringify({ personId, opUserId }),
    });
  }

  getGitLab(): Promise<GitLabIntegration> {
    return api('/api/integrations/gitlab');
  }

  saveGitLab(body: {
    baseUrl?: string;
    projectIds?: string[];
    token?: string;
    enabled?: boolean;
  }): Promise<GitLabIntegration> {
    return api('/api/integrations/gitlab', { method: 'PUT', body: JSON.stringify(body) });
  }

  syncGitLab(): Promise<{
    ok: boolean;
    message?: string;
    matched?: {
      sha: string;
      message: string;
      mergedAt: string;
      ticketId: string;
      reviewRounds: number;
      reopenCount: number;
      reviewBefore: number | null;
      reviewAfter: number | null;
      mrLink?: string;
    }[];
    unmatched?: {
      sha: string;
      message: string;
      mergedAt: string;
      ticketId: string;
    }[];
    updated?: number;
    errors?: string[];
  }> {
    return api('/api/integrations/gitlab/sync', { method: 'POST', body: '{}' });
  }

  getTeams(): Promise<TeamsIntegration> {
    return api('/api/integrations/teams');
  }

  saveTeams(body: {
    channel?: string;
    webhookUrl?: string;
    enabled?: boolean;
  }): Promise<TeamsIntegration> {
    return api('/api/integrations/teams', { method: 'PUT', body: JSON.stringify(body) });
  }

  sendTeams(body: {
    channel?: string;
    deadline?: boolean;
    overrun?: boolean;
    dryRun?: boolean;
  }): Promise<{
    ok: boolean;
    sent: boolean;
    count?: number;
    message?: string;
    messages?: { kind: 'deadline' | 'overrun'; ticketId: string; text: string }[];
  }> {
    return api('/api/integrations/teams/send', { method: 'POST', body: JSON.stringify(body) });
  }

  listKpiSnapshotPeriods(): Promise<{ periods: KpiSnapshotPeriodDto[] }> {
    return api('/api/kpi-snapshots/periods');
  }

  listKpiSnapshots(
    periodType: KpiPeriodType,
    periodKey: string,
  ): Promise<{ ok: boolean; rows: KpiSnapshotRowDto[]; message?: string }> {
    const query = new URLSearchParams({ periodType, periodKey });
    return api(`/api/kpi-snapshots?${query.toString()}`);
  }

  captureKpiSnapshot(
    periodType: KpiPeriodType,
    periodKey: string,
  ): Promise<{ ok: boolean; count?: number; message?: string }> {
    return api('/api/kpi-snapshots/capture', {
      method: 'POST',
      body: JSON.stringify({ periodType, periodKey }),
    });
  }

  authMe(): Promise<{ authenticated: boolean; person: Person | null; access: AccessRole | null }> {
    return api('/api/auth/me');
  }

  devLogin(personId: string): Promise<{ ok: boolean; person?: Person; access?: AccessRole; message?: string }> {
    return api('/api/auth/dev', { method: 'POST', body: JSON.stringify({ personId }) });
  }

  logout(): Promise<{ ok: boolean }> {
    return api('/api/auth/logout', { method: 'POST', body: '{}' });
  }

  updatePersonAccess(
    personId: string,
    body: {
      access?: AccessRole;
      level?: Level;
      track?: Track;
      gitlabUsername?: string | null;
      allowedTeams?: string[];
    },
  ): Promise<{ ok: boolean; person?: Person; message?: string }> {
    return api(`/api/org/people/${encodeURIComponent(personId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  getVisibility(): Promise<VisibilityConfig> {
    return api<VisibilityConfig>('/api/org/visibility');
  }

  updateVisibilityMatrix(matrix: TeamVisibilityRule[]): Promise<{ ok: boolean; matrix: TeamVisibilityRule[] }> {
    return api('/api/org/visibility/matrix', {
      method: 'PUT',
      body: JSON.stringify({ matrix }),
    });
  }

  updateUserAllowedTeams(userId: string, allowedTeams: string[]): Promise<{ ok: boolean; allowedTeams: string[] }> {
    return api(`/api/org/visibility/user/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify({ allowedTeams }),
    });
  }

  getProjects(): Promise<{ projects: OpenProjectCatalogEntry[] }> {
    return api('/api/org/projects');
  }

  updateProject(
    id: string | number,
    patch: { active?: boolean; assignedTeamIds?: string[] },
  ): Promise<{ ok: boolean; project?: OpenProjectCatalogEntry; message?: string }> {
    return api(`/api/org/projects/${encodeURIComponent(String(id))}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }

  syncProjects(): Promise<{ ok: boolean; total: number; projects: OpenProjectCatalogEntry[]; message?: string }> {
    return api('/api/org/projects/sync', {
      method: 'POST',
      body: '{}',
    });
  }

  getAuditLogs(params?: ListQueryParams): Promise<ListPageResult<AuditLogDto> & { logs: AuditLogDto[] }> {
    return api(`/api/org/audit-logs${toListQueryString(params)}`);
  }

  listWorkItems(params?: ListQueryParams): Promise<ListPageResult<Ticket> & { tickets: Ticket[] }> {
    return api(`/api/work-items${toListQueryString(params)}`);
  }

  getAnalyticsReport(): Promise<AnalyticsReport> {
    return api('/api/analytics/report');
  }

  runAnalytics(): Promise<AnalyticsReport> {
    return api('/api/analytics/run', { method: 'POST', body: '{}' });
  }

  getHandoffSla(): Promise<any> {
    return api('/api/v2/work/handoff-sla');
  }

  pingHandoff(ticketId: string, target?: string, message?: string): Promise<{ ok: boolean; message: string }> {
    return api(`/api/v2/work/handoff-ping/${encodeURIComponent(ticketId)}`, {
      method: 'POST',
      body: JSON.stringify({ target, message }),
    });
  }

  getQualityAudit(): Promise<any> {
    return api('/api/v2/quality/audit');
  }

  saveAllocations(ticketId: string, allocations: any[]): Promise<any> {
    return api(`/api/v2/tickets/${encodeURIComponent(ticketId)}/allocations`, {
      method: 'PATCH',
      body: JSON.stringify({ allocations }),
    });
  }

  getTimeAudit(): Promise<any> {
    return api('/api/v2/analytics/time-audit');
  }

  getDisputes(): Promise<any> {
    return api('/api/v2/disputes');
  }

  createDispute(body: {
    ticketId: string;
    requestedFlag: string;
    reason: string;
    evidenceUrl?: string;
  }): Promise<any> {
    return api('/api/v2/disputes', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  resolveDispute(id: string, status: 'APPROVED' | 'REJECTED', comment?: string): Promise<any> {
    return api(`/api/v2/disputes/${encodeURIComponent(id)}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({ status, comment }),
    });
  }

  getPreflightCheck(): Promise<any> {
    return api('/api/v2/snapshots/preflight-check');
  }

  getLeaves(): Promise<{ ok: boolean; leaves: import('./models').EmployeeLeave[] }> {
    return api('/api/v2/leaves');
  }

  createLeave(body: Omit<import('./models').EmployeeLeave, 'id'> & { id?: string }): Promise<{
    ok: boolean;
    leave?: import('./models').EmployeeLeave;
  }> {
    return api('/api/v2/leaves', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  deleteLeave(id: string): Promise<{ ok: boolean }> {
    return api(`/api/v2/leaves/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  detectWip(assigneeId: string, excludeTicketId?: string): Promise<{ ok: boolean; activeTickets: Ticket[] }> {
    return api('/api/work-items/md-mandate/detect-wip', {
      method: 'POST',
      body: JSON.stringify({ assigneeId, excludeTicketId }),
    });
  }

  shiftForMdMandate(body: {
    mdTicketId: string;
    targetTicketIds: string[];
    shiftDays: number;
  }): Promise<{ ok: boolean; updatedTickets: Ticket[]; shiftDays: number; message?: string }> {
    return api('/api/work-items/md-mandate/shift', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  getRubrics(): Promise<{ rubrics: any[] }> {
    return api('/api/rubrics');
  }

  updateRubric(rubricId: string, patch: any): Promise<{ ok: boolean; rubric: any }> {
    return api(`/api/rubrics/${encodeURIComponent(rubricId)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }

  getAiCoachSummary(personId: string, prompt?: string): Promise<{ ok: boolean; summary: string; provider: string }> {
    return api('/api/ai/coach-summary', {
      method: 'POST',
      body: JSON.stringify({ personId, prompt }),
    });
  }

  resumeTicket(ticketId: string): Promise<{ ok: boolean; ticket: Ticket; message?: string }> {
    return api('/api/work-items/md-mandate/resume', {
      method: 'POST',
      body: JSON.stringify({ ticketId }),
    });
  }

  liveSearchWorkItems(q: string): Promise<{
    source: 'live' | 'offline';
    local: {
      id: string;
      title: string;
      status: string;
      assigneeId: string;
      opId: number | null;
      source: string;
    }[];
    live: { id: string; opId: number; title: string; status: string; updatedAt: string | null }[];
    writeback: boolean;
    message?: string;
  }> {
    const query = new URLSearchParams({ q });
    return api(`/api/work-items/live-search?${query.toString()}`);
  }

  getWorkItemDetail(ticketId: string): Promise<TicketDetailResponse> {
    return api(`/api/work-items/${encodeURIComponent(ticketId)}/detail`);
  }

  createTimeEntry(
    ticketId: string,
    body: { hours: number; spentOn: string; comment?: string },
  ): Promise<{ ok: boolean; writebackDisabled?: boolean; message?: string }> {
    return api(`/api/work-items/${encodeURIComponent(ticketId)}/time-entries`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  postWorkItemComment(
    ticketId: string,
    comment: string,
  ): Promise<{ ok: boolean; writebackDisabled?: boolean; message?: string }> {
    return api(`/api/work-items/${encodeURIComponent(ticketId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  }

  getTeamTime(from?: string, to?: string): Promise<TeamTimeResponse> {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    const qs = query.toString();
    return api(`/api/team-time${qs ? `?${qs}` : ''}`);
  }

  getOpenMrs(assignedToMe = false): Promise<{
    source: 'live' | 'offline';
    items: OpenMrItem[];
    errors?: string[];
    message?: string;
  }> {
    const query = new URLSearchParams();
    if (assignedToMe) query.set('assignedToMe', '1');
    const qs = query.toString();
    return api(`/api/integrations/gitlab/open-mrs${qs ? `?${qs}` : ''}`);
  }

  discoverOpenProject(): Promise<{
    source: 'live' | 'offline' | 'error';
    projects: { id: string; name: string; identifier: string; active: boolean }[];
    statuses: { id: number; name: string; isClosed: boolean }[];
    types: { id: number; name: string; isMilestone: boolean }[];
    message?: string;
  }> {
    return api('/api/integrations/openproject/discovery');
  }

  listGitLabProjects(): Promise<{
    source: 'live' | 'offline' | 'error';
    projects: { id: string; name: string; path: string; webUrl: string }[];
    message?: string;
  }> {
    return api('/api/integrations/gitlab/projects');
  }
}

export interface TicketDetailResponse {
  ok: boolean;
  message?: string;
  source: 'live' | 'offline';
  writeback: boolean;
  ticket?: Ticket;
  scores?: {
    week: number;
    accuracy: number;
    review: number;
    reopen: number;
    total: number | null;
  };
  description?: string;
  relations?: {
    id: number;
    type: string;
    fromTitle: string;
    toTitle: string;
    fromId: number | null;
    toId: number | null;
  }[];
  attachments?: {
    id: number;
    fileName: string;
    fileSize: number;
    contentType: string;
    downloadUrl: string;
  }[];
  timeEntries?: {
    id: number;
    spentOn: string;
    hours: number;
    userTitle: string;
    comment: string;
  }[];
  activities?: { createdAt: string; text: string }[];
  mrs?: {
    iid: number;
    projectId: string;
    title: string;
    webUrl: string;
    state: string;
    ciStatus: string;
    commitSpan: { firstCommitOn: string | null; lastCommitOn: string | null; commitCount: number };
    unresolvedThreads: number;
    reviewRounds: number;
    reviewers: string[];
  }[];
  opUrl?: string | null;
  errors?: string[];
}

export interface TeamTimeResponse {
  source: 'live' | 'offline';
  from: string;
  to: string;
  days: string[];
  hoursPerDayTarget: number;
  writeback: boolean;
  rows: {
    personId: string;
    nickname: string;
    openprojectUserId: number | null;
    gitlabUsername: string | null;
    days: { date: string; hours: number; ticketIds: string[]; hasGitlabActivity: boolean }[];
    totalHours: number;
  }[];
  errors?: string[];
}

export interface OpenMrItem {
  projectId: string;
  iid: number;
  title: string;
  webUrl: string;
  author: string;
  reviewers: string[];
  ticketId: string;
  ageHours: number;
  ciStatus: string;
  createdAt: string;
  updatedAt: string;
}

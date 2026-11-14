import { Injectable } from '@angular/core';
import { AnalyticsReport } from './analytics';
import { AccessRole, Department, Level, Person, Team, Ticket, Track } from './models';
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

export interface BootstrapSettings {
  weeklyQuotas: Record<string, number>;
  trackWeights: TrackWeights;
  alertRules: AlertRules;
  levelOverrides: Record<string, string>;
  hoursPerMd: number;
  openprojectMapping: unknown;
}

export interface BootstrapResponse {
  people: Person[];
  tickets: Ticket[];
  settings: BootstrapSettings;
  departments: Department[];
  teams: Team[];
  auth: {
    authenticated: boolean;
    person: Person | null;
    access: AccessRole | null;
  };
}

export interface OpenProjectIntegration {
  configured: boolean;
  enabled: boolean;
  writeback: boolean;
  baseUrl: string;
  hasToken: boolean;
  mapping: Record<string, unknown>;
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

  devLogin(personId: string): Promise<{ ok: boolean; person?: Person; access?: AccessRole }> {
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
    },
  ): Promise<{ ok: boolean; person?: Person; message?: string }> {
    return api(`/api/org/people/${encodeURIComponent(personId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  getAuditLogs(): Promise<{ logs: AuditLogDto[] }> {
    return api('/api/org/audit-logs');
  }

  getAnalyticsReport(): Promise<AnalyticsReport> {
    return api('/api/analytics/report');
  }

  runAnalytics(): Promise<AnalyticsReport> {
    return api('/api/analytics/run', { method: 'POST', body: '{}' });
  }
}

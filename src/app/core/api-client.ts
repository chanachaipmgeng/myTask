import { Injectable } from '@angular/core';
import { AccessRole, Department, Person, Team, Ticket } from './models';
import { TrackWeights } from './scoring';
import { AlertRules } from './admin-settings';

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

  authMe(): Promise<{ authenticated: boolean; person: Person | null; access: AccessRole | null }> {
    return api('/api/auth/me');
  }

  devLogin(personId: string): Promise<{ ok: boolean; person?: Person; access?: AccessRole }> {
    return api('/api/auth/dev', { method: 'POST', body: JSON.stringify({ personId }) });
  }

  logout(): Promise<{ ok: boolean }> {
    return api('/api/auth/logout', { method: 'POST', body: '{}' });
  }
}

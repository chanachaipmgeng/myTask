import { computed, signal } from '@angular/core';
import { SAMPLE_VIEWERS, SampleViewer } from '../data/seed';
import { AccessRole, Level } from './models';
import { DEFAULT_TRACK_WEIGHTS, TrackWeights, WEEKLY_QUOTA, roundMd } from './scoring';
import { currentSession, sessionAccess } from './session';

export interface AlertRules {
  deadline: boolean;
  overrun: boolean;
  overrunLimit: number;
}

export type ConnectionId = 'myProject' | 'mygit' | 'teams';
export type ConnectionState = 'local-fixture' | 'off' | 'api';

export interface ConnectionSetting {
  id: ConnectionId;
  label: string;
  detail: string;
  state: ConnectionState;
}

const LEVELS: readonly Level[] = ['Senior', 'Mid', 'Junior', 'FirstMonth'];

const DEFAULT_CONNECTIONS: ConnectionSetting[] = [
  {
    id: 'myProject',
    label: 'myProject',
    detail: 'ซิงก์ผ่านเซิร์ฟเวอร์ หรือไฟล์ตัวอย่างเมื่อเซิร์ฟเวอร์ปิด',
    state: 'local-fixture',
  },
  {
    id: 'mygit',
    label: 'mygit',
    detail: 'อ่านไฟล์ตัวอย่างในเครื่อง ไม่เขียนคะแนนกลับ',
    state: 'local-fixture',
  },
  {
    id: 'teams',
    label: 'Teams',
    detail: 'ไม่ยิง webhook เก็บบันทึกในเครื่อง',
    state: 'local-fixture',
  },
];

export const weeklyQuotas = signal<Record<Level, number>>({ ...WEEKLY_QUOTA });
export const levelOverrides = signal<Record<string, Level>>({});
export const accessOverrides = signal<Record<string, AccessRole>>({});
export const viewAsRole = signal<AccessRole | null>(null);
export const trackWeights = signal<TrackWeights>(cloneWeights(DEFAULT_TRACK_WEIGHTS));
export const alertRules = signal<AlertRules>({ deadline: true, overrun: true, overrunLimit: 1.5 });
export const connections = signal<ConnectionSetting[]>(DEFAULT_CONNECTIONS.map((item) => ({ ...item })));
export const hoursPerMd = signal(6);
export const viewerId = signal(SAMPLE_VIEWERS[0].id);

export const currentViewer = computed(() => {
  const session = currentSession();
  if (session) {
    const overridden = accessOverrides()[session.person.id] ?? session.access;
    return {
      id: session.person.id,
      nickname: session.person.nickname,
      access: overridden,
    } satisfies SampleViewer;
  }
  const found = SAMPLE_VIEWERS.find((viewer) => viewer.id === viewerId()) ?? SAMPLE_VIEWERS[0];
  const overridden = accessOverrides()[found.id] ?? found.access;
  return {
    ...found,
    access: overridden,
  };
});

export const actualRole = computed<AccessRole>(() => {
  const access = sessionAccess();
  if (access) {
    return accessOverrides()[currentSession()?.person.id ?? ''] ?? access;
  }
  return currentViewer().access;
});

export const effectiveRole = computed<AccessRole>(() => {
  return viewAsRole() ?? actualRole();
});

export const canEditAdmin = computed(() => {
  const role = effectiveRole();
  return role === 'admin' || (!currentSession() && role === 'lead');
});

/** Assign / accept queue proposals: admin or lead (API rejects member). */
export const canAssignWork = computed(() => {
  const role = effectiveRole();
  return role === 'admin' || role === 'lead';
});

/** Capture KPI snapshots for a period: same gate as assign. */
export const canCaptureKpi = canAssignWork;

export function toggleViewAsMember(): AccessRole {
  const current = viewAsRole();
  if (current === 'member') {
    viewAsRole.set(null);
  } else {
    viewAsRole.set('member');
  }
  return effectiveRole();
}

export function setViewer(id: string): SampleViewer {
  if (SAMPLE_VIEWERS.some((viewer) => viewer.id === id)) {
    viewerId.set(id);
    viewAsRole.set(null);
  }
  return currentViewer();
}

export function setPersonAccess(personId: string, access: AccessRole): boolean {
  if (!canEditAdmin() || !['admin', 'lead', 'member'].includes(access) || personId.trim() === '') {
    return false;
  }
  accessOverrides.update((current) => ({ ...current, [personId]: access }));
  return true;
}

export function setWeeklyQuota(level: Level, quota: number): boolean {
  if (!canEditAdmin() || !Number.isFinite(quota) || quota < 0 || quota > 40) {
    return false;
  }
  weeklyQuotas.update((current) => ({ ...current, [level]: roundMd(quota) }));
  return true;
}

export function setPersonLevel(personId: string, level: Level): boolean {
  if (!canEditAdmin() || !LEVELS.includes(level) || personId.trim() === '') {
    return false;
  }
  levelOverrides.update((current) => ({ ...current, [personId]: level }));
  return true;
}

export function setTrackWeights(next: TrackWeights): boolean {
  if (!canEditAdmin() || !weightsInRange(next)) {
    return false;
  }
  trackWeights.set(cloneWeights(next));
  return true;
}

export function setAlertRules(next: AlertRules): boolean {
  if (!canEditAdmin() || !Number.isFinite(next.overrunLimit) || next.overrunLimit <= 1 || next.overrunLimit > 5) {
    return false;
  }
  alertRules.set({
    deadline: next.deadline,
    overrun: next.overrun,
    overrunLimit: roundMd(next.overrunLimit),
  });
  return true;
}

export function setConnectionState(id: ConnectionId, state: ConnectionState): boolean {
  if (!canEditAdmin() || (state !== 'local-fixture' && state !== 'off' && state !== 'api')) {
    return false;
  }
  connections.update((current) => current.map((item) => (item.id === id ? { ...item, state } : item)));
  return true;
}

export function applyRemoteSettings(settings: {
  weeklyQuotas?: Record<string, number>;
  trackWeights?: TrackWeights;
  alertRules?: AlertRules;
  levelOverrides?: Record<string, string>;
  hoursPerMd?: number;
}): void {
  if (settings.weeklyQuotas) {
    weeklyQuotas.set({
      Senior: Number(settings.weeklyQuotas['Senior'] ?? WEEKLY_QUOTA.Senior),
      Mid: Number(settings.weeklyQuotas['Mid'] ?? WEEKLY_QUOTA.Mid),
      Junior: Number(settings.weeklyQuotas['Junior'] ?? WEEKLY_QUOTA.Junior),
      FirstMonth: Number(settings.weeklyQuotas['FirstMonth'] ?? WEEKLY_QUOTA.FirstMonth),
    });
  }
  if (settings.trackWeights) {
    trackWeights.set(cloneWeights(settings.trackWeights));
  }
  if (settings.alertRules) {
    alertRules.set({ ...settings.alertRules });
  }
  if (settings.levelOverrides) {
    const next: Record<string, Level> = {};
    for (const [id, level] of Object.entries(settings.levelOverrides)) {
      if (LEVELS.includes(level as Level)) {
        next[id] = level as Level;
      }
    }
    levelOverrides.set(next);
  }
  if (typeof settings.hoursPerMd === 'number' && settings.hoursPerMd > 0) {
    hoursPerMd.set(settings.hoursPerMd);
  }
  connections.update((current) =>
    current.map((item) =>
      item.id === 'myProject' ? { ...item, state: 'api', detail: 'ซิงก์ผ่านเซิร์ฟเวอร์ OpenProject' } : item,
    ),
  );
}

function weightsInRange(weights: TrackWeights): boolean {
  return Object.values(weights.implement).every(inRange) && Object.values(weights.research).every(inRange);
}

function inRange(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function cloneWeights(weights: TrackWeights): TrackWeights {
  return {
    implement: { ...weights.implement },
    research: { ...weights.research },
  };
}

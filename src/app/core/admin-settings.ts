import { computed, signal } from '@angular/core';
import { SAMPLE_VIEWERS, SampleViewer } from '../data/seed';
import { Level } from './models';
import { DEFAULT_TRACK_WEIGHTS, TrackWeights, WEEKLY_QUOTA, roundMd } from './scoring';

export interface AlertRules {
  deadline: boolean;
  overrun: boolean;
  overrunLimit: number;
}

export type ConnectionId = 'myProject' | 'mygit' | 'teams';
export type ConnectionState = 'local-fixture' | 'off';

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
    detail: 'อ่านไฟล์ตัวอย่างในเครื่อง ไม่เขียนกลับ',
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
export const trackWeights = signal<TrackWeights>(cloneWeights(DEFAULT_TRACK_WEIGHTS));
export const alertRules = signal<AlertRules>({ deadline: true, overrun: true, overrunLimit: 1.5 });
export const connections = signal<ConnectionSetting[]>(DEFAULT_CONNECTIONS.map((item) => ({ ...item })));
export const viewerId = signal(SAMPLE_VIEWERS[0].id);

export const currentViewer = computed(() => {
  return SAMPLE_VIEWERS.find((viewer) => viewer.id === viewerId()) ?? SAMPLE_VIEWERS[0];
});

export const canEditAdmin = computed(() => currentViewer().access === 'lead');

export function setViewer(id: string): SampleViewer {
  if (SAMPLE_VIEWERS.some((viewer) => viewer.id === id)) {
    viewerId.set(id);
  }
  return currentViewer();
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
  if (!canEditAdmin() || (state !== 'local-fixture' && state !== 'off')) {
    return false;
  }
  connections.update((current) => current.map((item) => (item.id === id ? { ...item, state } : item)));
  return true;
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

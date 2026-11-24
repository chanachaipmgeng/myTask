import { Injectable, signal } from '@angular/core';
import {
  DueBucket,
  WorkFilterOptions,
  WorkTrackFilter,
  mondayOfWeek,
  shiftIsoDay,
} from '../../core/work-views';
import { Person } from '../../core/models';
import { todayInBangkok } from '../../core/workflow';

export type WorkHubScope = 'mine' | 'team';

type PersistedHubFilter = {
  track: WorkTrackFilter;
  query: string;
  teamId: string;
  opProject: string;
  opType: string;
  dueBucket: DueBucket;
  weekOffset: number;
};

function storageKey(scope: WorkHubScope): string {
  return `md-work-hub-filter:${scope}`;
}

@Injectable()
export class WorkHubFilter {
  readonly track = signal<WorkTrackFilter>('All');
  readonly query = signal('');
  readonly scope = signal<WorkHubScope>('team');
  readonly assigneeId = signal('');
  /** '' = ทุกทีม */
  readonly teamId = signal('');
  /** '' = ทุกโปรเจกต์ */
  readonly opProject = signal('');
  /** '' = ทุกชนิดใบงาน */
  readonly opType = signal('');
  readonly dueBucket = signal<DueBucket>('all');
  /** 0 = สัปดาห์นี้, -1 ย้อน, +1 ถัดไป */
  readonly weekOffset = signal(0);

  /** จันทร์ของสัปดาห์ที่เลือก */
  weekStartIso(): string {
    const base = mondayOfWeek(todayInBangkok());
    const offset = this.weekOffset();
    return offset ? shiftIsoDay(base, offset * 7) : base;
  }

  /** Options passed into shared/domain work-views helpers. */
  filterOptions(people?: readonly Person[]): WorkFilterOptions {
    const assigneeId = this.assigneeId().trim();
    const teamId = this.teamId().trim();
    const opProject = this.opProject().trim();
    const opType = this.opType().trim();
    const dueBucket = this.dueBucket();
    return {
      track: this.track(),
      query: this.query(),
      today: todayInBangkok(),
      weekStart: this.weekStartIso(),
      dueBucket,
      ...(this.scope() === 'mine' && assigneeId ? { assigneeId } : {}),
      ...(teamId ? { teamId } : {}),
      ...(opProject ? { opProject } : {}),
      ...(opType ? { opType } : {}),
      ...(people ? { people } : {}),
    };
  }

  restoreFromStorage(scope: WorkHubScope): void {
    try {
      const raw = sessionStorage.getItem(storageKey(scope));
      if (!raw) {
        return;
      }
      const data = JSON.parse(raw) as Partial<PersistedHubFilter>;
      if (
        data.track === 'All' ||
        data.track === 'Implement' ||
        data.track === 'RD' ||
        data.track === 'IMP' ||
        data.track === 'RND' ||
        data.track === 'QA' ||
        data.track === 'UXBA' ||
        data.track === 'SUP' ||
        data.track === 'INFRA'
      ) {
        this.track.set(data.track);
      }
      if (typeof data.query === 'string') {
        this.query.set(data.query);
      }
      if (typeof data.teamId === 'string') {
        this.teamId.set(data.teamId);
      }
      if (typeof data.opProject === 'string') {
        this.opProject.set(data.opProject);
      }
      if (typeof data.opType === 'string') {
        this.opType.set(data.opType);
      }
      if (
        data.dueBucket === 'all' ||
        data.dueBucket === 'overdue' ||
        data.dueBucket === 'today' ||
        data.dueBucket === 'tomorrow' ||
        data.dueBucket === 'thisWeek' ||
        data.dueBucket === 'later'
      ) {
        this.dueBucket.set(data.dueBucket);
      }
      if (typeof data.weekOffset === 'number' && Number.isFinite(data.weekOffset)) {
        this.weekOffset.set(Math.max(-4, Math.min(4, Math.trunc(data.weekOffset))));
      }
    } catch {
      /* ignore bad session payload */
    }
  }

  persist(): void {
    const payload: PersistedHubFilter = {
      track: this.track(),
      query: this.query(),
      teamId: this.teamId(),
      opProject: this.opProject(),
      opType: this.opType(),
      dueBucket: this.dueBucket(),
      weekOffset: this.weekOffset(),
    };
    try {
      sessionStorage.setItem(storageKey(this.scope()), JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
  }
}

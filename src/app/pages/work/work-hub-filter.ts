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

/** Persist เฉพาะมิติของหน้า hub — ทีม/สาย/โปรเจกต์มาจาก Global Filter */
type PersistedHubFilter = {
  query: string;
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
  readonly statusScope = signal<'unclosed' | 'closed' | 'all'>('unclosed');
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
    const statusScope = this.statusScope();
    return {
      track: this.track(),
      query: this.query(),
      today: todayInBangkok(),
      weekStart: this.weekStartIso(),
      dueBucket,
      statusScope,
      ...(assigneeId ? { assigneeId } : {}),
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
      if (typeof data.query === 'string') {
        this.query.set(data.query);
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
      query: this.query(),
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

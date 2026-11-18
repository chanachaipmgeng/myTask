import { Injectable, signal } from '@angular/core';
import { WorkFilterOptions, WorkTrackFilter } from '../../core/work-views';

export type WorkHubScope = 'mine' | 'team';

@Injectable()
export class WorkHubFilter {
  readonly track = signal<WorkTrackFilter>('All');
  readonly query = signal('');
  readonly scope = signal<WorkHubScope>('team');
  readonly assigneeId = signal('');

  /** Options passed into shared/domain work-views helpers. */
  filterOptions(): WorkFilterOptions {
    const assigneeId = this.assigneeId().trim();
    return {
      track: this.track(),
      query: this.query(),
      ...(this.scope() === 'mine' && assigneeId ? { assigneeId } : {}),
    };
  }
}

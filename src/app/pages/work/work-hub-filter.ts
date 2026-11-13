import { Injectable, signal } from '@angular/core';
import { WorkTrackFilter } from '../../core/work-views';

@Injectable()
export class WorkHubFilter {
  readonly track = signal<WorkTrackFilter>('All');
  readonly query = signal('');
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  DayMarkersService,
  GanttAllModule,
  SelectionService,
} from '@syncfusion/ej2-angular-gantt';
import { ScorecardService } from '../../core/scorecard.service';
import { workGanttTasks } from '../../core/work-views';
import { WorkHubFilter } from './work-hub-filter';

@Component({
  selector: 'app-work-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GanttAllModule],
  providers: [SelectionService, DayMarkersService],
  templateUrl: './work-timeline.html',
})
export class WorkTimeline {
  private readonly scorecard = inject(ScorecardService);
  private readonly hub = inject(WorkHubFilter);

  protected readonly taskFields = {
    id: 'TaskID',
    name: 'TaskName',
    startDate: 'StartDate',
    endDate: 'EndDate',
    duration: 'Duration',
    progress: 'Progress',
    baselineStartDate: 'BaselineStartDate',
    baselineEndDate: 'BaselineEndDate',
    resourceInfo: 'ResourceInfo',
  };
  protected readonly columns = [
    { field: 'TaskID', headerText: 'รหัส', width: 110 },
    { field: 'TaskName', headerText: 'งาน', width: 260 },
    { field: 'StartDate', headerText: 'เริ่ม' },
    { field: 'EndDate', headerText: 'สิ้นสุด' },
    { field: 'Duration', headerText: 'วัน' },
  ];
  protected readonly labelSettings = { taskLabel: 'TaskName', rightLabel: 'ResourceInfo' };
  protected readonly timelineSettings = {
    topTier: { unit: 'Week' as const, format: 'MMM dd' },
    bottomTier: { unit: 'Day' as const, count: 1 },
  };
  protected readonly workWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  protected readonly splitterSettings = { columnIndex: 3 };

  protected readonly tasks = computed(() =>
    workGanttTasks(this.scorecard.tickets(), this.scorecard.people(), {
      track: this.hub.track(),
      query: this.hub.query(),
    }),
  );

  protected readonly resources = computed(() =>
    this.scorecard.people().map((person) => ({
      resourceId: person.id,
      resourceName: person.nickname,
    })),
  );

  protected readonly resourceFields = { id: 'resourceId', name: 'resourceName' };
}

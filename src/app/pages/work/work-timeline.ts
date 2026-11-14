import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  DayMarkersService,
  EditService,
  GanttAllModule,
  SelectionService,
  ToolbarService,
} from '@syncfusion/ej2-angular-gantt';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { canAssignWork } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { workGanttTasks } from '../../core/work-views';
import { WorkHubFilter } from './work-hub-filter';

@Component({
  selector: 'app-work-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GanttAllModule, MessageModule],
  providers: [SelectionService, DayMarkersService, EditService, ToolbarService],
  templateUrl: './work-timeline.html',
})
export class WorkTimeline {
  private readonly scorecard = inject(ScorecardService);
  private readonly hub = inject(WorkHubFilter);
  private readonly notice = inject(ShellNotice);

  protected readonly canEdit = canAssignWork;
  protected readonly statusMessage = signal('');
  protected readonly errorMessage = signal('');

  protected readonly toolbar = ['ExpandAll', 'CollapseAll', 'ZoomIn', 'ZoomOut', 'ZoomToFit', 'Search'];
  protected readonly editSettings = computed(() => ({
    allowEditing: this.canEdit(),
    allowTaskbarEditing: this.canEdit(),
    mode: 'Auto' as const,
  }));

  protected readonly taskFields = {
    id: 'TaskID',
    name: 'TaskName',
    parentID: 'ParentID',
    startDate: 'StartDate',
    endDate: 'EndDate',
    duration: 'Duration',
    progress: 'Progress',
    baselineStartDate: 'BaselineStartDate',
    baselineEndDate: 'BaselineEndDate',
    resourceInfo: 'ResourceInfo',
  };
  protected readonly columns = [
    { field: 'TaskID', headerText: 'รหัส', width: 120, isPrimaryKey: true, allowEditing: false },
    { field: 'TaskName', headerText: 'งาน (Epic / Story / Task)', width: 260, allowEditing: false },
    { field: 'StartDate', headerText: 'เริ่ม', width: 115, editType: 'datepickeredit' },
    { field: 'EndDate', headerText: 'ครบกำหนด (Due)', width: 125, editType: 'datepickeredit' },
    { field: 'Duration', headerText: 'วัน', width: 80, allowEditing: false },
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

  protected readonly hierarchyCount = computed(
    () => this.tasks().filter((task) => task.ParentID !== null).length,
  );

  protected readonly resources = computed(() =>
    this.scorecard.people().map((person) => ({
      resourceId: person.id,
      resourceName: person.nickname,
    })),
  );

  protected readonly resourceFields = { id: 'resourceId', name: 'resourceName' };

  protected async onActionComplete(args: { requestType?: string; data?: unknown }): Promise<void> {
    if (args.requestType !== 'save' || !this.canEdit()) {
      return;
    }
    const raw = Array.isArray(args.data) ? args.data[0] : args.data;
    if (!raw || typeof raw !== 'object') {
      return;
    }
    const record = (raw as { taskData?: Record<string, unknown> }).taskData ?? (raw as Record<string, unknown>);
    const taskId = typeof record['TaskID'] === 'string' ? record['TaskID'] : '';
    if (!taskId) {
      return;
    }
    const startDate = toIsoDate(record['StartDate']);
    const dueDate = toIsoDate(record['EndDate']);
    const result = await this.scorecard.updateTicketDates(taskId, { startDate, dueDate });
    if (!result.ok) {
      const msg = result.message ?? 'แก้ไขวันที่ไม่สำเร็จ';
      this.errorMessage.set(msg);
      this.statusMessage.set('');
      this.notice.show(msg);
      return;
    }
    let text = `บันทึกวันของ ${taskId} แล้ว (ล็อก firstDueOn คงเดิม)`;
    if (result.writebackError) {
      text += ` · เขียนกลับ OpenProject ไม่สำเร็จ: ${result.writebackError}`;
      this.errorMessage.set(result.writebackError);
    } else {
      this.errorMessage.set('');
    }
    this.statusMessage.set(text);
    this.notice.show(text);
  }
}

function toIsoDate(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return undefined;
}

import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  DayMarkersService,
  EditService,
  GanttAllModule,
  GanttComponent,
  SelectionService,
  ToolbarService,
} from '@syncfusion/ej2-angular-gantt';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { canAssignWork } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import { workGanttTasks } from '../../core/work-views';
import {
  FilterChipOption,
  FilterChipsComponent,
  SectionCardComponent,
  SfGanttComponent,
  SfGanttOptions,
  SfMessageComponent,
} from '../../shared/ui';
import { WorkHubFilter } from './work-hub-filter';

type GanttViewMode = 'project' | 'resource';

@Component({
  selector: 'app-work-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionCardComponent, FilterChipsComponent, SfGanttComponent, SfMessageComponent],
  templateUrl: './work-timeline.html',
})
export class WorkTimeline {
  private readonly scorecard = inject(ScorecardService);
  private readonly hub = inject(WorkHubFilter);
  private readonly notice = inject(ShellNotice);
  protected readonly theme = inject(ThemeService);

  @ViewChild('workGantt') private workGantt?: SfGanttComponent;

  protected readonly ganttOptions = computed<SfGanttOptions>(() => ({
    id: 'work-gantt',
    height: '580px',
    viewType: this.ganttViewType(),
    renderBaseline: this.viewMode() === 'project',
    allowSelection: true,
    enableVirtualization: false,
    treeColumnIndex: 1,
    gridLines: 'Horizontal',
    toolbar: this.toolbar as any,
    editSettings: this.editSettings(),
    labelSettings: this.labelSettings,
    timelineSettings: this.timelineSettings,
    projectStartDate: this.projectStartDate(),
    workWeek: this.workWeek,
    splitterSettings: this.splitterSettings,
    resourceFields: this.resourceFields,
  }));

  protected readonly isMine = computed(() => this.hub.scope() === 'mine');
  /** Date edits only on team timeline for admin/lead — personal hub stays read-only. */
  protected readonly canEdit = computed(() => canAssignWork() && !this.isMine());
  protected readonly statusMessage = signal('');
  protected readonly errorMessage = signal('');
  /** project = โครงสร้างแม่-ลูก · resource = จัดกลุ่มตามผู้รับผิดชอบ (ไม่คำนวณ work unit) */
  protected readonly viewMode = signal<GanttViewMode>('project');

  protected readonly viewModeOptions: FilterChipOption[] = [
    { id: 'project', label: 'มุมมองโครงงาน' },
    { id: 'resource', label: 'มุมมองตามคน' },
  ];

  protected readonly toolbar = ['ExpandAll', 'CollapseAll', 'ZoomIn', 'ZoomOut', 'ZoomToFit', 'Search'];
  protected readonly editSettings = computed(() => ({
    allowEditing: this.canEdit(),
    allowTaskbarEditing: this.canEdit(),
    mode: 'Auto' as const,
  }));

  protected readonly ganttViewType = computed(() =>
    this.viewMode() === 'resource' ? 'ResourceView' : 'ProjectView',
  );

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
  protected readonly columns = computed(() => {
    const resourceMode = this.viewMode() === 'resource';
    return [
      {
        field: 'TaskID',
        headerText: 'รหัส',
        width: 140,
        isPrimaryKey: !resourceMode,
        allowEditing: false,
        visible: !resourceMode,
      },
      {
        field: 'TaskName',
        headerText: resourceMode ? 'ผู้รับ / งาน' : 'งาน (Epic / Story / Task)',
        width: resourceMode ? 240 : 210,
        allowEditing: false,
      },
      { field: 'StartDate', headerText: 'เริ่ม', width: 105, editType: 'datepickeredit' },
      { field: 'EndDate', headerText: 'กำหนดส่ง (Due)', width: 120, editType: 'datepickeredit' },
      { field: 'Duration', headerText: 'วัน', width: 65, allowEditing: false },
    ];
  });

  protected readonly labelSettings = { taskLabel: 'TaskName', rightLabel: 'ResourceInfo' };
  protected readonly timelineSettings = {
    topTier: { unit: 'Week' as const, format: 'MMM dd' },
    bottomTier: { unit: 'Day' as const, count: 1 },
  };
  protected readonly workWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  protected readonly splitterSettings = { position: '42%' };

  protected readonly tasks = computed(() =>
    workGanttTasks(
      this.scorecard.tickets(),
      this.scorecard.people(),
      this.hub.filterOptions(this.scorecard.people()),
    ),
  );

  /**
   * Resource View: แบน ParentID · clone ResourceInfo เฉพาะ id ที่อยู่ใน resources
   * (กัน constructResourceViewDataSource พังเมื่อ object ไม่มี resourceId)
   */
  protected readonly ganttTasks = computed(() => {
    const list = this.tasks();
    const known = new Map(this.resources().map((r) => [r.resourceId, r.resourceName]));
    const resourceMode = this.viewMode() === 'resource';
    return list.map((task) => {
      const resourceInfo = (task.ResourceInfo ?? [])
        .map((item) => item.resourceId)
        .filter((id): id is string => !!id && known.has(id))
        .map((resourceId) => ({
          resourceId,
          resourceName: known.get(resourceId) ?? resourceId,
        }));
      return {
        ...task,
        ParentID: resourceMode ? null : task.ParentID,
        ResourceInfo: resourceInfo,
      };
    });
  });

  protected readonly projectStartDate = computed(() => {
    const list = this.ganttTasks();
    const timestamps = list
      .map((t) => (t.StartDate ? new Date(t.StartDate).getTime() : NaN))
      .filter((n) => !isNaN(n));
    if (timestamps.length === 0) return undefined;
    const earliest = new Date(Math.min(...timestamps));
    earliest.setDate(earliest.getDate() - 3);
    return earliest;
  });

  protected readonly hierarchyCount = computed(
    () => this.tasks().filter((task) => task.ParentID !== null).length,
  );

  protected readonly assignedCount = computed(
    () => this.ganttTasks().filter((task) => task.ResourceInfo.length > 0).length,
  );

  protected readonly resources = computed(() =>
    this.scorecard.people().map((person) => ({
      resourceId: person.id,
      resourceName: person.nickname,
    })),
  );

  protected readonly resourceFields = { id: 'resourceId', name: 'resourceName' };

  protected setViewMode(mode: string): void {
    if (this.isMine()) {
      this.viewMode.set('project');
      return;
    }
    if (mode === 'resource' || mode === 'project') {
      this.viewMode.set(mode);
    }
  }

  protected onGanttCreated(): void {
    // Resource View สร้าง flatData แล้ว แต่ TreeGrid บางครั้งยังไม่ paint — บังคับ refresh ครั้งเดียว
    if (this.viewMode() !== 'resource') {
      return;
    }
    queueMicrotask(() => {
      const gantt = this.workGantt?.instance();
      gantt?.treeGrid?.refresh();
      gantt?.expandAll();
    });
  }

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
      this.notice.error(msg);
      return;
    }
    let text = `บันทึกวันของ ${taskId} แล้ว (ล็อก firstDueOn คงเดิม)`;
    if (result.writebackError) {
      text += ` · เขียนกลับ OpenProject ไม่สำเร็จ: ${result.writebackError}`;
      this.errorMessage.set(result.writebackError);
      this.statusMessage.set(text);
      this.notice.warning(text);
      return;
    }
    this.errorMessage.set('');
    this.statusMessage.set(text);
    this.notice.success(text);
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

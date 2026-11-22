import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  input,
  output,
} from '@angular/core';
import {
  ColumnModel,
  CriticalPathService,
  DayMarkersService,
  EditService,
  EditSettingsModel,
  ExcelExportService,
  FilterService,
  GanttComponent,
  GanttModule,
  LabelSettingsModel,
  ResizeService,
  SelectionService,
  SortService,
  SplitterSettingsModel,
  TaskFieldsModel,
  TimelineSettingsModel,
  ToolbarItem,
  ToolbarService,
  ViewType,
} from '@syncfusion/ej2-angular-gantt';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';

export interface SfGanttOptions {
  id?: string;
  height?: string;
  viewType?: ViewType;
  renderBaseline?: boolean;
  enableCriticalPath?: boolean;
  allowSorting?: boolean;
  allowFiltering?: boolean;
  allowResizing?: boolean;
  allowExcelExport?: boolean;
  highlightWeekends?: boolean;
  projectStartDate?: Date;
  workWeek?: string[];
  treeColumnIndex?: number;
  allowSelection?: boolean;
  enableVirtualization?: boolean;
  gridLines?: 'Both' | 'Horizontal' | 'Vertical' | 'None';
  toolbar?: ToolbarItem[];
  splitterSettings?: SplitterSettingsModel;
  timelineSettings?: TimelineSettingsModel;
  labelSettings?: LabelSettingsModel;
  editSettings?: EditSettingsModel;
  resourceFields?: object;
  motion?: MotionInput;
}

@Component({
  selector: 'app-sf-gantt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GanttModule, MotionWrapperComponent],
  providers: [
    EditService,
    SelectionService,
    ToolbarService,
    DayMarkersService,
    SortService,
    FilterService,
    ResizeService,
    ExcelExportService,
    CriticalPathService,
  ],
  template: `
    <app-motion-wrapper
      [config]="options().motion"
      variant="fade-up"
      [refreshKey]="data().length"
    >
    <div #hostBox class="sf-gantt-wrap">
      <ejs-gantt
        #ganttRef
        [id]="options().id ?? 'sf-gantt'"
        [dataSource]="data()"
        [resources]="resources()"
        [resourceFields]="options().resourceFields ?? { id: 'resourceId', name: 'resourceName' }"
        [taskFields]="taskFields()"
        [columns]="columns()"
        [viewType]="options().viewType ?? 'ProjectView'"
        [height]="options().height ?? '520px'"
        [renderBaseline]="options().renderBaseline ?? true"
        [enableCriticalPath]="options().enableCriticalPath ?? false"
        [highlightWeekends]="options().highlightWeekends ?? true"
        [allowSorting]="options().allowSorting ?? true"
        [allowFiltering]="options().allowFiltering ?? false"
        [allowResizing]="options().allowResizing ?? true"
        [allowExcelExport]="options().allowExcelExport ?? true"
        [toolbar]="options().toolbar ?? defaultToolbar"
        [splitterSettings]="options().splitterSettings ?? { position: '36%' }"
        [timelineSettings]="options().timelineSettings ?? {}"
        [labelSettings]="options().labelSettings ?? {}"
        [editSettings]="options().editSettings ?? { allowEditing: false }"
        [projectStartDate]="options().projectStartDate ?? undefined"
        [workWeek]="options().workWeek ?? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']"
        [treeColumnIndex]="options().treeColumnIndex ?? 1"
        [allowSelection]="options().allowSelection ?? true"
        [enableVirtualization]="options().enableVirtualization ?? false"
        [gridLines]="options().gridLines ?? 'Horizontal'"
        (created)="created.emit()"
        (actionComplete)="actionComplete.emit($event)"
        (taskbarEdited)="taskbarEdited.emit($event)"
        (queryTaskbarInfo)="queryTaskbarInfo.emit($event)"
      ></ejs-gantt>
    </div>
    </app-motion-wrapper>
  `,
  styles: `
    :host, .sf-gantt-wrap {
      display: block;
      width: 100%;
      min-width: 0;
    }
  `,
})
export class SfGanttComponent implements AfterViewInit, OnDestroy {
  @ViewChild('ganttRef') private ganttRef?: GanttComponent;
  @ViewChild('hostBox') private hostBox?: ElementRef<HTMLElement>;

  readonly data = input<object[]>([]);
  readonly resources = input<object[]>([]);
  readonly taskFields = input<TaskFieldsModel>({});
  readonly columns = input<ColumnModel[]>([]);
  readonly options = input<SfGanttOptions>({});

  readonly created = output<void>();
  readonly actionComplete = output<any>();
  readonly taskbarEdited = output<any>();
  readonly queryTaskbarInfo = output<any>();

  protected readonly defaultToolbar: ToolbarItem[] = [
    'ZoomIn',
    'ZoomOut',
    'ZoomToFit',
    'ExpandAll',
    'CollapseAll',
    'ExcelExport',
  ];

  private resizeObserver?: ResizeObserver;
  private resizeTimer?: ReturnType<typeof setTimeout>;

  ngAfterViewInit(): void {
    if (typeof ResizeObserver !== 'undefined' && this.hostBox?.nativeElement) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.resizeTimer) clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => this.ganttRef?.refresh(), 180);
      });
      this.resizeObserver.observe(this.hostBox.nativeElement);
    }
  }

  ngOnDestroy(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
  }

  instance(): GanttComponent | undefined {
    return this.ganttRef;
  }
}

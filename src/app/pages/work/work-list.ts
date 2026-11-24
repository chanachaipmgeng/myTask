import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { ScorecardService } from '../../core/scorecard.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { workListRows } from '../../core/work-views';
import {
  PersonAvatarComponent,
  SectionCardComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
  StatusBadgeComponent,
  planToneMap,
  toneForWeekLabel,
  workflowStatusToneMap,
  type BadgeTone,
} from '../../shared/ui';
import { WorkHubFilter } from './work-hub-filter';

@Component({
  selector: 'app-work-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    StatusBadgeComponent,
    SectionCardComponent,
    PersonAvatarComponent,
    SfGridComponent,
  ],
  templateUrl: './work-list.html',
})
export class WorkList {
  private readonly scorecard = inject(ScorecardService);
  private readonly hub = inject(WorkHubFilter);
  private readonly ticketDetail = inject(TicketDetailService);

  protected readonly groupByProject = signal(true);
  protected readonly workflowStatusToneMap = workflowStatusToneMap;
  protected readonly planToneMap = planToneMap;
  protected readonly isMine = computed(() => this.hub.scope() === 'mine');

  protected readonly columns: SfGridColumn[] = [
    { field: 'workLabel', headerText: 'Work', width: 280 },
    { field: 'projectLabel', headerText: 'โปรเจกต์', width: 140 },
    { field: 'teamLabel', headerText: 'ทีม', width: 130 },
    { field: 'type', headerText: 'Type', width: 110 },
    { field: 'assignee', headerText: 'Assignee', width: 165 },
    { field: 'status', headerText: 'Status', width: 130 },
    { field: 'size', headerText: 'Size', width: 80 },
    { field: 'dueOnLabel', headerText: 'Due', width: 110 },
    { field: 'policyDateLabel', headerText: 'Policy Date', width: 135 },
    { field: 'policySlaLabel', headerText: 'สถานะ SLA', width: 120 },
    { field: 'receiptDateLabel', headerText: 'Receipt Date', width: 115, visible: false },
    { field: 'alertDateLabel', headerText: 'Alert Date', width: 115, visible: false },
    { field: 'replyDateLabel', headerText: 'Reply Date', width: 115, visible: false },
    { field: 'closedOnLabel', headerText: 'Closed', width: 110 },
    { field: 'weekOffsetLabel', headerText: 'สัปดาห์', width: 130 },
    { field: 'unplannedLabel', headerText: 'แผน', width: 110 },
    {
      field: 'action',
      headerText: 'Action',
      width: 110,
      textAlign: 'Center',
      allowFiltering: false,
      allowSorting: false,
    },
  ];

  protected readonly gridOptions = computed<SfGridOptions>(() =>
    listGridOptions({
      id: this.isMine() ? 'my-work-operational-list-grid-v5' : 'work-operational-list-grid-v5',
      enablePersistence: true,
      filtering: 'Excel',
      grouping: this.groupByProject(),
      groupColumns: this.groupByProject() ? ['projectLabel'] : [],
      autoFreezeDesktop: 2,
      columnChooser: true,
      excelExport: true,
      csvExport: true,
      exportFileName: this.isMine() ? 'my-work-list' : 'team-work-list',
    }),
  );

  protected readonly rows = computed(() =>
    workListRows(
      this.scorecard.tickets(),
      this.scorecard.people(),
      this.hub.filterOptions(this.scorecard.people()),
    ),
  );

  protected toggleGroupByProject(): void {
    this.groupByProject.update((v) => !v);
  }

  protected weekTone(label: string): BadgeTone {
    return toneForWeekLabel(label);
  }

  protected openDetail(id: string, event?: Event): void {
    event?.stopPropagation();
    if (!id) return;
    this.ticketDetail.open(id);
  }

  protected onRowSelected(event: { data?: unknown }): void {
    const id = (event.data as { id?: string } | undefined)?.id;
    if (id) this.openDetail(id);
  }
}

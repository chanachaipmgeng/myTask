import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import type { DataStateChangeEventArgs } from '@syncfusion/ej2-angular-grids';
import {
  ApiClient,
  ListQueryParams,
  listQueryFromGridState,
} from '../../core/api-client';
import { ScorecardService } from '../../core/scorecard.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { workListRows, type WorkListRow } from '../../core/work-views';
import {
  PersonAvatarComponent,
  SectionCardComponent,
  StatusBadgeComponent,
  planToneMap,
  toneForPriority,
  toneForTicketType,
  toneForWeekLabel,
  workflowStatusToneMap,
  type BadgeTone,
} from '../../shared/ui';
import {
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  SfGridRemoteData,
  listGridOptions,
} from '../../shared/sf/sf-grid/sf-grid';
import { WorkHubFilter } from './work-hub-filter';

const WORK_LIST_REMOTE_SORT = new Set([
  'id',
  'module',
  'estimateMd',
  'actualMd',
  'assigneeId',
  'workflowStatus',
  'closedOn',
  'dueOn',
  'firstDueOn',
  'track',
  'size',
  'type',
]);

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
  private readonly workspace = inject(WorkspaceFilter);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly api = inject(ApiClient, { optional: true });

  protected readonly groupByProject = signal(true);
  protected readonly workflowStatusToneMap = workflowStatusToneMap;
  protected readonly planToneMap = planToneMap;
  protected readonly isMine = computed(() => this.hub.scope() === 'mine');

  private readonly remotePage = signal(1);
  private readonly remotePageSize = signal(25);
  private readonly remoteSort = signal('id');
  private readonly remoteDir = signal<'asc' | 'desc'>('asc');
  private readonly remoteRows = signal<WorkListRow[]>([]);
  private readonly remoteTotal = signal(0);
  private remoteLoadSeq = 0;

  protected readonly useRemote = computed(
    () => Boolean(this.api) && this.scorecard.usingApi() && !this.scorecard.mockMode(),
  );

  protected readonly columns: SfGridColumn[] = [
    { field: 'workLabel', headerText: 'Work', width: 280 },
    { field: 'projectLabel', headerText: 'โปรเจกต์', width: 140 },
    { field: 'teamLabel', headerText: 'ทีม', width: 130 },
    { field: 'type', headerText: 'Type', width: 155 },
    { field: 'assignee', headerText: 'Assignee', width: 165 },
    { field: 'status', headerText: 'Status', width: 130 },
    { field: 'priorityLabel', headerText: 'Priority', width: 110 },
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
      id: this.isMine()
        ? this.useRemote()
          ? 'my-work-operational-list-grid-v8-remote'
          : 'my-work-operational-list-grid-v8'
        : this.useRemote()
          ? 'work-operational-list-grid-v8-remote'
          : 'work-operational-list-grid-v8',
      enablePersistence: true,
      filtering: 'Excel',
      grouping: this.useRemote() ? false : this.groupByProject(),
      groupColumns: this.useRemote() || !this.groupByProject() ? [] : ['projectLabel'],
      autoFreezeDesktop: 2,
      columnChooser: true,
      excelExport: true,
      csvExport: true,
      exportFileName: this.isMine() ? 'my-work-list' : 'team-work-list',
      remote: this.useRemote(),
    }),
  );

  protected readonly localRows = computed(() =>
    workListRows(
      this.scorecard.tickets(),
      this.scorecard.people(),
      this.hub.filterOptions(this.scorecard.people()),
    ),
  );

  protected readonly remoteGridData = computed<SfGridRemoteData<WorkListRow>>(() => ({
    result: this.remoteRows(),
    count: this.remoteTotal(),
  }));

  protected readonly gridData = computed(() =>
    this.useRemote() ? this.remoteGridData() : this.localRows(),
  );

  protected readonly rows = computed(() =>
    this.useRemote() ? this.remoteRows() : this.localRows(),
  );

  private readonly reloadRemote = effect(() => {
    if (!this.useRemote()) return;
    this.hub.query();
    this.hub.track();
    this.hub.assigneeId();
    this.hub.teamId();
    this.hub.opProject();
    this.hub.opType();
    this.hub.statusScope();
    this.workspace.track();
    this.workspace.teamId();
    this.workspace.personId();
    this.workspace.opProject();
    this.workspace.opType();
    this.workspace.statusScope();
    this.remotePage();
    this.remotePageSize();
    this.remoteSort();
    this.remoteDir();
    void this.loadRemoteRows();
  });

  protected toggleGroupByProject(): void {
    if (this.useRemote()) return;
    this.groupByProject.update((v) => !v);
  }

  protected typeTone(label: string): BadgeTone {
    return toneForTicketType(label);
  }

  protected priorityTone(label: string): BadgeTone {
    return toneForPriority(label);
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

  protected onGridDataStateChange(state: DataStateChangeEventArgs): void {
    if (!this.useRemote()) return;
    const mapped = listQueryFromGridState(state);
    if (mapped.page) this.remotePage.set(mapped.page);
    if (mapped.pageSize) this.remotePageSize.set(mapped.pageSize);
    if (mapped.sort && WORK_LIST_REMOTE_SORT.has(mapped.sort)) {
      this.remoteSort.set(mapped.sort);
    } else if (mapped.sort) {
      this.remoteSort.set('id');
    }
    if (mapped.dir) this.remoteDir.set(mapped.dir);
    if (mapped.q != null) {
      this.hub.query.set(mapped.q);
      this.remotePage.set(1);
    }
  }

  private buildRemoteQuery(): ListQueryParams {
    const track = this.hub.track() !== 'All' ? this.hub.track() : this.workspace.track();
    const teamId = this.hub.teamId() || this.workspace.teamId();
    const assigneeId = this.hub.assigneeId() || this.workspace.personId();
    const project = this.hub.opProject() || this.workspace.opProject();
    const opType = this.hub.opType() || this.workspace.opType();
    return {
      page: Math.max(1, this.remotePage()),
      pageSize: Math.max(1, this.remotePageSize()),
      sort: this.remoteSort(),
      dir: this.remoteDir(),
      q: this.hub.query().trim() || undefined,
      track: track && track !== 'All' ? String(track) : undefined,
      teamId: teamId || undefined,
      assigneeId: assigneeId || undefined,
      project: project || undefined,
      opType: opType || undefined,
      statusScope: this.hub.statusScope() || this.workspace.statusScope(),
    };
  }

  private async loadRemoteRows(): Promise<void> {
    if (!this.api || !this.useRemote()) return;
    const seq = ++this.remoteLoadSeq;
    try {
      const res = await this.api.listWorkItems(this.buildRemoteQuery());
      if (seq !== this.remoteLoadSeq) return;
      const tickets = res.tickets ?? res.items ?? res.result ?? [];
      const mapped = workListRows(tickets, this.scorecard.people(), {
        ...this.hub.filterOptions(this.scorecard.people()),
        // dueBucket/week คงกรองฝั่ง client บนหน้าปัจจุบันจนกว่า API จะรองรับ
        statusScope: 'all',
        track: 'All',
        query: '',
        assigneeId: undefined,
        teamId: undefined,
        opProject: undefined,
        opType: undefined,
      });
      this.remoteRows.set(mapped);
      this.remoteTotal.set(res.count ?? res.total ?? mapped.length);
      if (res.page && res.page > 0) this.remotePage.set(res.page);
      if (res.pageSize && res.pageSize > 0) this.remotePageSize.set(res.pageSize);
    } catch {
      if (seq !== this.remoteLoadSeq) return;
      this.remoteRows.set([]);
      this.remoteTotal.set(0);
    }
  }
}

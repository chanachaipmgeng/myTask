import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { currentViewer } from '../../core/admin-settings';
import { accuracyScatterPoints } from '../../core/dashboard-charts';
import { computeThreeWayTimeAudit } from '../../core/multi-team';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { ShellNotice } from '../../core/shell-notice';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import {
  BadgeTone,
  FilterChipOption,
  FilterChipsComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  SfChartComponent,
  SfChartOptions,
  SfChartSeriesConfig,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
  SfMessageComponent,
  StatusBadgeComponent,
  scatterBandSeries,
} from '../../shared/ui';

@Component({
  selector: 'app-time-audit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonModule,
    PageHeadComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    FilterChipsComponent,
    StatusBadgeComponent,
    SfChartComponent,
    SfGridComponent,
    SfMessageComponent,
  ],
  templateUrl: './time-audit.html',
})
export class TimeAuditPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly scorecard = inject(ScorecardService);
  private readonly workspace = inject(WorkspaceFilter);
  private readonly notice = inject(ShellNotice);
  private readonly ticketDetail = inject(TicketDetailService);

  protected readonly gridColumns: SfGridColumn[] = [
    { field: 'ticketId', headerText: 'รหัสใบงาน', width: 115 },
    { field: 'title', headerText: 'ชื่องาน', width: 185 },
    { field: 'assignee', headerText: 'ผู้รับผิดชอบ', width: 145 },
    { field: 'estimateMd', headerText: 'Est (1)', width: 100, textAlign: 'Right' },
    { field: 'openProjectActualMd', headerText: 'OP Act (2)', width: 100, textAlign: 'Right' },
    { field: 'gitlabSpanMd', headerText: 'GitLab Span (3)', width: 145, textAlign: 'Right' },
    { field: 'ratio', headerText: 'สัดส่วน', width: 85, textAlign: 'Right' },
    { field: 'anomalyLabel', headerText: 'ความผิดปกติ', width: 165 },
  ];

  protected readonly gridOptions: SfGridOptions = listGridOptions({
    id: 'time-audit-grid',
    filtering: 'Excel',
    columnChooser: true,
    excelExport: true,
    csvExport: true,
    height: '380px',
    exportFileName: 'three-way-time-audit',
  });

  protected openTicket(id: string): void {
    if (id) {
      this.ticketDetail.open(id);
    }
  }

  protected readonly isMine = this.route.snapshot.data['scope'] === 'mine';
  protected readonly activePersonId = computed(
    () => currentSession()?.person.id ?? currentViewer().id,
  );
  protected readonly myTicketIds = computed(() => {
    const selfId = this.activePersonId();
    return new Set(
      this.scorecard
        .tickets()
        .filter((t) => t.assigneeId === selfId)
        .map((t) => t.id),
    );
  });

  protected readonly filterType = signal<string>('ALL');
  protected readonly report = computed(() => {
    if (this.isMine) {
      return this.scorecard.threeWayTimeReport();
    }
    return computeThreeWayTimeAudit(
      this.workspace.applyToTickets(this.scorecard.tickets()),
      this.workspace.applyToPeople(this.scorecard.roster()),
    );
  });

  protected readonly scopedRows = computed(() => {
    const rows = this.report().rows;
    if (!this.isMine) {
      return rows;
    }
    const mine = this.myTicketIds();
    return rows.filter((r) => mine.has(r.ticketId));
  });

  protected readonly anomalyToneMap: Record<string, BadgeTone> = {
    OK: 'secondary',
    OUTLIER: 'danger',
    MISSING_TIME: 'danger',
    GHOST_PROGRESS: 'warning',
    TIME_MISMATCH: 'warning',
  };

  protected readonly filterOptions = computed<FilterChipOption[]>(() => {
    const rows = this.scopedRows();
    return [
      { id: 'ALL', label: 'ทั้งหมด', count: rows.length },
      {
        id: 'MISSING',
        label: 'ลืมลงเวลา Actual',
        count: rows.filter((r) => r.anomalyType === 'MISSING_TIME').length,
      },
      {
        id: 'GHOST',
        label: 'ไม่มี Git Commit',
        count: rows.filter((r) => r.anomalyType === 'GHOST_PROGRESS').length,
      },
      {
        id: 'OVERRUN',
        label: 'เกิน 1.5x / เวลาคลาดเคลื่อน',
        count: rows.filter((r) => r.anomalyType === 'OUTLIER' || r.anomalyType === 'TIME_MISMATCH').length,
      },
    ];
  });

  protected readonly filteredRows = computed(() => {
    const ft = this.filterType();
    const rows = this.scopedRows();
    if (ft === 'MISSING') {
      return rows.filter((r) => r.anomalyType === 'MISSING_TIME');
    }
    if (ft === 'GHOST') {
      return rows.filter((r) => r.anomalyType === 'GHOST_PROGRESS');
    }
    if (ft === 'OVERRUN') {
      return rows.filter((r) => r.anomalyType === 'OUTLIER' || r.anomalyType === 'TIME_MISMATCH');
    }
    return rows;
  });

  protected setFilter(type: string): void {
    this.filterType.set(type);
  }

  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' };
  protected readonly scatterPoints = computed(() => {
    const ids = new Set(this.filteredRows().map((row) => row.ticketId));
    return accuracyScatterPoints(this.scorecard.tickets().filter((ticket) => ids.has(ticket.id)));
  });
  protected readonly scatterXAxis = {
    valueType: 'Double' as const,
    title: 'Estimate (MD)',
    minimum: 0,
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorGridLines: { width: 1, dashArray: '4,4' },
  };
  protected readonly scatterYAxis = computed(() => {
    const peak = this.scatterPoints().reduce((max, point) => Math.max(max, point.ratio), 0);
    return {
      title: 'อัตราส่วนสุทธิ',
      minimum: 0,
      maximum: Math.max(2.5, Math.ceil(peak * 2) / 2),
      titleStyle: this.axisFont,
      labelStyle: this.axisFont,
      majorGridLines: { width: 1, dashArray: '4,4' },
      stripLines: [
        {
          start: 1,
          size: 2,
          sizeType: 'Pixel' as const,
          color: '#64748b',
          dashArray: '6,4',
          text: 'อัตราส่วน 1.0',
          horizontalAlignment: 'End' as const,
          textStyle: { color: '#64748b', size: '11px' },
        },
      ],
    };
  });
  protected readonly scatterSeries = computed<SfChartSeriesConfig[]>(() =>
    scatterBandSeries(this.scatterPoints()),
  );
  protected readonly scatterOptions: SfChartOptions = {
    height: '320px',
    exportable: true,
    fullscreenable: true,
    enableAnimation: true,
    legend: { visible: true, position: 'Top', textStyle: this.axisFont },
    tooltip: { enable: true, shared: false, header: '', format: '${point.tooltip}' },
  };

  protected rerunAudit(): void {
    this.notice.info('กำลังเรียกเครื่องยนต์ Python Analytics เพื่อคำนวณและตรวจสอบเวลา 3 ทางใหม่...');
    void this.scorecard.reloadFromApi();
  }
}

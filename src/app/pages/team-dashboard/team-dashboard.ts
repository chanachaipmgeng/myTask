import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { canCaptureKpi } from '../../core/admin-settings';
import { ApiClient, KpiSnapshotPeriodDto, KpiSnapshotRowDto } from '../../core/api-client';
import { mdCompositionTrend, monthlyTrend, personMonthIndexHeatmap, quotaBars } from '../../core/dashboard-charts';
import { kpiExplanations } from '../../core/kpi-meaning';
import { KpiPeriodType, previousMonthKey } from '../../core/kpi-snapshot';
import { ScorecardService } from '../../core/scorecard.service';
import { ThemeService } from '../../core/theme.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { INDEX_TARGET, formatMd, sampleWorkloadPoints } from '../../core/scoring';
import { ShellNotice } from '../../core/shell-notice';
import { todayInBangkok } from '../../core/workflow';
import { TEAM_CONTEXT_2568 } from '../../data/team-context';
import {
  FormFieldComponent,
  LoadingSkeletonComponent,
  PageHeadComponent,
  SectionCardComponent,
  SfChartComponent,
  SfChartOptions,
  SfChartSeriesConfig,
  SfDonutChartComponent,
  SfHeatmapCell,
  SfHeatmapComponent,
  SfHeatmapOptions,
  SfDonutChartOptions,
  SfDropdownComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  SfMessageComponent,
  SfTextBoxComponent,
} from '../../shared/ui';
import type { WorkspaceTrackFilter } from '../../../../shared/domain/workspace-scope';

type TrackFilter = WorkspaceTrackFilter;

const LIVE_MODE = 'live';

@Component({
  selector: 'app-team-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    PageHeadComponent,
    SectionCardComponent,
    FormFieldComponent,
    LoadingSkeletonComponent,
    SfChartComponent,
    SfDonutChartComponent,
    SfHeatmapComponent,
    SfDropdownComponent,
    SfGridComponent,
    SfMessageComponent,
    SfTextBoxComponent,
  ],
  templateUrl: './team-dashboard.html',
  styleUrl: './team-dashboard.scss',
})
export class TeamDashboard {
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient, { optional: true });
  private readonly notice = inject(ShellNotice);
  private readonly workspace = inject(WorkspaceFilter);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly canCapture = canCaptureKpi;
  protected readonly context = TEAM_CONTEXT_2568;
  protected readonly captureTypeOptions = [
    { text: 'เดือน', value: 'month' },
    { text: 'ไตรมาส', value: 'quarter' },
  ];
  protected readonly track = signal<TrackFilter>('All');
  private readonly syncWorkspaceTrack = effect(() => {
    const track = this.workspace.track();
    if (this.track() !== track) {
      this.track.set(track);
    }
  });
  private readonly scopedPeople = computed(() => this.workspace.applyToPeople(this.scorecard.people()));
  private readonly scopedTickets = computed(() =>
    this.workspace.applyToTickets(this.scorecard.tickets(), this.scorecard.people()),
  );
  protected readonly periodMode = signal(LIVE_MODE);
  protected readonly periods = signal<KpiSnapshotPeriodDto[]>([]);
  protected readonly snapshotRows = signal<KpiSnapshotRowDto[]>([]);
  protected readonly captureType = signal<KpiPeriodType>('month');
  protected readonly captureKey = signal(previousMonthKey(todayInBangkok()));
  protected readonly isExistingSnapshot = computed(() => {
    const type = this.captureType();
    const key = this.captureKey().trim();
    return this.periods().some((p) => p.periodType === type && p.periodKey === key);
  });
  protected readonly capturing = signal(false);
  protected readonly snapshotMessage = signal('');
  protected readonly snapshotError = signal('');
  protected readonly loadingSnapshot = signal(false);

  protected readonly palette = ['#4c68e5', '#3ec6e0', '#f0b429', '#7465e8', '#e35d6a', '#8fd0c6'];
  protected readonly target = INDEX_TARGET;
  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' };
  protected readonly categoryAxis = {
    valueType: 'Category' as const,
    majorGridLines: { width: 0 },
    labelStyle: this.axisFont,
  };
  protected readonly percentAxis = {
    minimum: 0,
    opposedPosition: true,
    title: 'เปอร์เซ็นต์',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorGridLines: { width: 1, dashArray: '4,4' },
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };
  protected readonly quotaAxis = {
    minimum: 0,
    opposedPosition: true,
    title: 'MD',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorGridLines: { width: 1, dashArray: '4,4' },
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };

  protected readonly snapshotColumns: SfGridColumn[] = [
    { field: 'nickname', headerText: 'พนักงาน', width: 175, cellType: 'person', personIdField: 'personId' },
    { field: 'trackLabel', headerText: 'สาย', width: 115, cellType: 'badge' },
    { field: 'index', headerText: 'ดัชนี', width: 140, format: 'N1', cellType: 'progress' },
    { field: 'closedCount', headerText: 'ใบปิด', width: 90, textAlign: 'Right', cellType: 'metric' },
    { field: 'closedMd', headerText: 'MD ปิด', width: 105, textAlign: 'Right', format: 'N2', cellType: 'metric' },
    { field: 'planIndex', headerText: 'แผน %', width: 100, textAlign: 'Right', format: 'N1', cellType: 'metric', suffix: '%' },
    { field: 'weighted', headerText: 'ถ่วงใบ', width: 100, textAlign: 'Right', format: 'N1', cellType: 'metric' },
  ];
  protected readonly snapshotGridOptions: SfGridOptions = {
    id: 'team-snapshot-grid',
    height: '320',
    paging: true,
    pageSize: 8,
    sorting: true,
    resizable: true,
    excelExport: true,
    exportFileName: 'team-kpi-snapshot',
  };

  protected readonly workloadDonutOptions: SfDonutChartOptions = {
    height: '260px',
    innerRadius: '60%',
    radius: '82%',
    centerLabel: `${TEAM_CONTEXT_2568.tasks.toLocaleString('en-US')}<br>งาน`,
    palettes: this.palette,
    legend: { visible: true, position: 'Bottom', alignment: 'Center' },
    tooltip: { enable: true, format: '${point.x}: <b>${point.y}%</b>' },
    exportable: true,
    exportFileName: 'team-workload-donut',
  };

  protected readonly sampleDonutOptions = computed<SfDonutChartOptions>(() => {
    const md = this.samplePoints().reduce((sum, point) => sum + point.y, 0);
    return {
      height: '260px',
      innerRadius: '60%',
      radius: '82%',
      centerLabel: `${formatMd(md)}<br>MD`,
      palettes: this.palette,
      legend: { visible: true, position: 'Bottom', alignment: 'Center' },
      tooltip: { enable: true, format: '${point.x}: <b>${point.y}</b> MD' },
      exportable: true,
      exportFileName: 'team-sample-donut',
    };
  });

  protected readonly monthlySeries = computed<SfChartSeriesConfig[]>(() => {
    const pts = this.monthlyPoints();
    const seriesMarker = { visible: true, width: 7, height: 7, shape: 'Circle', isFilled: true };
    const targetMarker = { visible: true, width: 8, height: 8, shape: 'Diamond', isFilled: true, fill: '#f0b429', border: { width: 1, color: '#f0b429' } };
    return [
      { type: 'Line', dataSource: pts, xName: 'month', yName: 'plan', name: 'ปิดตามแผน', width: 2.5, fill: '#2e4fc8', marker: seriesMarker },
      { type: 'Line', dataSource: pts, xName: 'month', yName: 'accuracy', name: 'ความแม่น', width: 2.5, fill: '#3ec6e0', marker: seriesMarker },
      { type: 'Line', dataSource: pts, xName: 'month', yName: 'rework', name: 'Rework', width: 2.5, fill: '#e35d6a', marker: seriesMarker },
      { type: 'Line', dataSource: pts, xName: 'month', yName: 'target', name: 'เป้า 75', width: 2, fill: '#f0b429', dashArray: '6,4', marker: targetMarker },
    ];
  });
  protected readonly monthlyChartOptions: SfChartOptions = {
    height: '260px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'team-monthly-trend',
    enableAnimation: true,
    legend: { visible: true, position: 'Top', alignment: 'Center', textStyle: this.axisFont },
    tooltip: { enable: true, shared: true, enableMarker: true, header: '${point.x}', format: '${series.name}: <b>${point.y}</b>' },
  };

  protected readonly quotaSeries = computed<SfChartSeriesConfig[]>(() => {
    const pts = this.quotaPoints();
    return [
      { type: 'StackingColumn', dataSource: pts, xName: 'nickname', yName: 'used', name: 'ใช้แล้ว', fill: '#2e4fc8', columnWidth: 0.48 },
      { type: 'StackingColumn', dataSource: pts, xName: 'nickname', yName: 'free', name: 'ว่าง', fill: '#c7d2fe', columnWidth: 0.48, cornerRadius: { topLeft: 8, topRight: 8 } },
    ];
  });
  protected readonly quotaChartOptions: SfChartOptions = {
    height: '260px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'team-quota-bars',
    enableAnimation: true,
    legend: { visible: true, position: 'Top', alignment: 'Center', textStyle: this.axisFont },
    tooltip: { enable: true, shared: true, enableMarker: true, header: '${point.x}', format: '${series.name}: <b>${point.y}</b>' },
  };

  protected readonly mdCompSeries = computed<SfChartSeriesConfig[]>(() => {
    const pts = this.mdCompositionPoints();
    return [
      { type: 'StackingArea', dataSource: pts, xName: 'month', yName: 'plannedMd', name: 'Planned (ในแผน)', fill: '#2e4fc8', opacity: 0.82 },
      { type: 'StackingArea', dataSource: pts, xName: 'month', yName: 'unplannedGeneralMd', name: 'Unplanned ทั่วไป', fill: '#3ec6e0', opacity: 0.82 },
      { type: 'StackingArea', dataSource: pts, xName: 'month', yName: 'mdMandateMd', name: '⚡ MD Mandate (สั่งตรง)', fill: '#f59e0b', opacity: 0.88 },
    ];
  });
  protected readonly mdCompChartOptions: SfChartOptions = {
    height: '270px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'team-md-composition',
    enableAnimation: true,
    legend: { visible: true, position: 'Top', alignment: 'Center', textStyle: this.axisFont },
    tooltip: { enable: true, shared: true, enableMarker: true, header: '${point.x}', format: '${series.name}: <b>${point.y}</b>' },
  };

  protected readonly alerts = this.scorecard.alerts;
  protected readonly explanations = computed(() => kpiExplanations(this.scopedTickets(), this.scopedPeople()));
  protected readonly filterHint = computed(() =>
    this.workspace.hasActiveFilter() ? `กำลังกรอง: ${this.workspace.filterSummary()}` : '',
  );

  protected readonly viewingLive = computed(() => this.periodMode() === LIVE_MODE);

  protected readonly periodOptions = computed(() => [
    { text: 'ปัจจุบัน (คำนวณสด)', value: LIVE_MODE },
    ...this.periods().map((period) => ({
      text: `${period.periodType === 'month' ? 'เดือน' : 'ไตรมาส'} ${period.periodKey} · ${period.rowCount} คน`,
      value: `${period.periodType}|${period.periodKey}`,
    })),
  ]);

  protected readonly monthlyPoints = computed(() =>
    monthlyTrend(this.scopedPeople(), this.scopedTickets(), this.track()),
  );
  protected readonly quotaPoints = computed(() =>
    quotaBars(this.scopedPeople(), this.scopedTickets(), this.track()),
  );
  protected readonly mdCompositionPoints = computed(() =>
    mdCompositionTrend(this.scopedTickets()),
  );
  protected readonly indexHeatmap = computed(() =>
    personMonthIndexHeatmap(this.scopedPeople(), this.scopedTickets()),
  );
  protected readonly heatCells = computed<SfHeatmapCell[]>(() =>
    this.indexHeatmap().cells.map((cell) => ({
      x: cell.month,
      y: cell.nickname,
      value: cell.index,
    })),
  );
  protected readonly heatOptions = computed<SfHeatmapOptions>(() => ({
    height: `${Math.min(560, Math.max(300, this.indexHeatmap().people.length * 36 + 108))}px`,
    xTitle: 'เดือนที่ปิดงาน',
  }));

  protected readonly samplePoints = computed(() =>
    sampleWorkloadPoints(this.scopedTickets(), this.track()),
  );

  protected readonly sampleSummary = computed(() => {
    const track = this.track();
    const tickets = this.scopedTickets().filter((ticket) => track === 'All' || ticket.track === track);
    const md = tickets.reduce(
      (sum, ticket) => sum + (ticket.closed ? ticket.actualMd : ticket.estimateMd),
      0,
    );
    return `${tickets.length} ใบ · ${formatMd(md)} MD`;
  });

  protected readonly snapshotTableRows = computed(() => {
    const track = this.track();
    return this.snapshotRows()
      .filter((row) => track === 'All' || row.track === track)
      .map((row) => ({
        nickname: row.nickname,
        trackLabel: row.track === 'RD' ? 'R&D' : 'Implement',
        index: round1(row.score.developmentIndex),
        closedCount: row.score.closedCount,
        closedMd: row.score.closedMd,
        planIndex: round1(row.score.planIndexPct),
        weighted: round1(row.score.weightedScore),
      }));
  });

  protected readonly tasksLabel = TEAM_CONTEXT_2568.tasks.toLocaleString('en-US');

  constructor() {
    void this.reloadPeriods();
  }

  protected setTrackChip(value: string): void {
    this.workspace.setTrack(value);
    this.track.set(this.workspace.track());
  }

  protected drillToWork(track?: TrackFilter): void {
    if (track && track !== 'All') {
      this.workspace.setTrack(track);
    }
    void this.workspace.navigateWithFilter(['/work']);
  }

  protected drillToTickets(track?: TrackFilter): void {
    if (track && track !== 'All') {
      this.workspace.setTrack(track);
    }
    void this.workspace.navigateWithFilter(['/tickets']);
  }

  protected drillToPeople(): void {
    void this.workspace.navigateWithFilter(['/people']);
  }

  protected onSamplePointClick(args: { point?: { x?: unknown } }): void {
    const label = String(args.point?.x ?? '').toLowerCase();
    if (label.includes('r&d') || label.includes('rd')) {
      this.drillToTickets('RD');
      return;
    }
    if (label.includes('implement') || label.includes('imp')) {
      this.drillToTickets('Implement');
      return;
    }
    this.drillToTickets();
  }

  protected setPeriodMode(raw: unknown): void {
    const value = String(raw ?? LIVE_MODE);
    this.periodMode.set(value);
    if (value === LIVE_MODE) {
      this.snapshotRows.set([]);
      this.snapshotError.set('');
      return;
    }
    const [periodType, periodKey] = value.split('|') as [KpiPeriodType, string];
    void this.loadSnapshot(periodType, periodKey);
  }

  protected setCaptureType(raw: unknown): void {
    if (raw === 'month' || raw === 'quarter') {
      this.captureType.set(raw);
    }
  }

  protected onCaptureKey(raw: string): void {
    this.captureKey.set((raw ?? '').trim());
  }

  protected async captureSnapshot(): Promise<void> {
    if (!this.canCapture()) {
      this.snapshotError.set('เฉพาะ admin หรือ lead ที่จับ snapshot ได้');
      return;
    }
    if (!this.api) {
      this.snapshotError.set('โหมด mock ไม่บันทึก snapshot ลงเซิร์ฟเวอร์');
      return;
    }
    const periodType = this.captureType();
    const periodKey = this.captureKey().trim();
    if (!periodKey) {
      this.snapshotError.set('ใส่รหัสช่วง เช่น 2025-10 หรือ 2025-Q3');
      return;
    }
    this.capturing.set(true);
    this.snapshotError.set('');
    try {
      const result = await this.api.captureKpiSnapshot(periodType, periodKey);
      if (!result.ok) {
        const text = result.message ?? 'จับ snapshot ไม่สำเร็จ';
        this.snapshotError.set(text);
        this.notice.error(text);
        return;
      }
      const text = `จับ snapshot ${periodType} ${periodKey} แล้ว ${result.count ?? 0} คน`;
      this.snapshotMessage.set(text);
      this.notice.success(text);
      await this.reloadPeriods();
      this.periodMode.set(`${periodType}|${periodKey}`);
      await this.loadSnapshot(periodType, periodKey);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'จับ snapshot ไม่สำเร็จ';
      this.snapshotError.set(text);
      this.notice.error(text);
    } finally {
      this.capturing.set(false);
    }
  }

  private async reloadPeriods(): Promise<void> {
    if (!this.api || this.scorecard.mockMode() || !this.scorecard.usingApi()) {
      this.periods.set([]);
      return;
    }
    try {
      const result = await this.api.listKpiSnapshotPeriods();
      this.periods.set(result.periods);
    } catch {
      this.periods.set([]);
    }
  }

  private async loadSnapshot(periodType: KpiPeriodType, periodKey: string): Promise<void> {
    if (!this.api) {
      this.snapshotRows.set([]);
      return;
    }
    this.loadingSnapshot.set(true);
    this.snapshotError.set('');
    try {
      const result = await this.api.listKpiSnapshots(periodType, periodKey);
      if (!result.ok) {
        this.snapshotRows.set([]);
        this.snapshotError.set(result.message ?? 'โหลด snapshot ไม่สำเร็จ');
        return;
      }
      this.snapshotRows.set(result.rows);
    } catch (error) {
      this.snapshotRows.set([]);
      this.snapshotError.set(error instanceof Error ? error.message : 'โหลด snapshot ไม่สำเร็จ');
    } finally {
      this.loadingSnapshot.set(false);
    }
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AccumulationChartModule,
  AccumulationDataLabelService,
  AccumulationLegendService,
  AccumulationTooltipService,
  CategoryService,
  ChartModule,
  ColumnSeriesService,
  LegendService,
  LineSeriesService,
  PieSeriesService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { GridModule } from '@syncfusion/ej2-angular-grids';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { DashboardLayoutModule } from '@syncfusion/ej2-angular-layouts';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { canCaptureKpi } from '../../core/admin-settings';
import { ApiClient, KpiSnapshotPeriodDto, KpiSnapshotRowDto } from '../../core/api-client';
import { monthlyTrend, quotaBars } from '../../core/dashboard-charts';
import { kpiExplanations } from '../../core/kpi-meaning';
import { KpiPeriodType, previousMonthKey } from '../../core/kpi-snapshot';
import { Track } from '../../core/models';
import { ScorecardService } from '../../core/scorecard.service';
import { INDEX_TARGET, formatMd, sampleWorkloadPoints } from '../../core/scoring';
import { ShellNotice } from '../../core/shell-notice';
import { todayInBangkok } from '../../core/workflow';
import { TEAM_CONTEXT_2568 } from '../../data/team-context';

type TrackFilter = Track | 'All';

const LIVE_MODE = 'live';

@Component({
  selector: 'app-team-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayoutModule,
    AccumulationChartModule,
    ChartModule,
    DropDownListModule,
    ButtonModule,
    GridModule,
    TextBoxModule,
    MessageModule,
  ],
  providers: [
    PieSeriesService,
    AccumulationLegendService,
    AccumulationTooltipService,
    AccumulationDataLabelService,
    CategoryService,
    LineSeriesService,
    ColumnSeriesService,
    LegendService,
    TooltipService,
  ],
  templateUrl: './team-dashboard.html',
})
export class TeamDashboard {
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient, { optional: true });
  private readonly notice = inject(ShellNotice);

  protected readonly canCapture = canCaptureKpi;
  protected readonly context = TEAM_CONTEXT_2568;
  protected readonly cellSpacing = [12, 12];
  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly trackOptions = [
    { text: 'ทั้งหมด', value: 'All' },
    { text: 'R&D', value: 'RD' },
    { text: 'Implement', value: 'Implement' },
  ];
  protected readonly captureTypeOptions = [
    { text: 'เดือน', value: 'month' },
    { text: 'ไตรมาส', value: 'quarter' },
  ];
  protected readonly track = signal<TrackFilter>('All');
  protected readonly periodMode = signal(LIVE_MODE);
  protected readonly periods = signal<KpiSnapshotPeriodDto[]>([]);
  protected readonly snapshotRows = signal<KpiSnapshotRowDto[]>([]);
  protected readonly captureType = signal<KpiPeriodType>('month');
  protected readonly captureKey = signal(previousMonthKey(todayInBangkok()));
  protected readonly capturing = signal(false);
  protected readonly snapshotMessage = signal('');
  protected readonly snapshotError = signal('');
  protected readonly loadingSnapshot = signal(false);

  protected readonly legend = { visible: true, position: 'Bottom' };
  protected readonly contextLabel = {
    visible: true,
    name: 'text',
    position: 'Inside',
    font: { fontFamily: 'Sarabun, Tahoma, sans-serif', color: '#fffdf8', size: '12px', fontWeight: '600' },
  };
  protected readonly sampleLabel = {
    visible: true,
    name: 'text',
    position: 'Outside',
    font: { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '11px', color: '#e8f4fb' },
  };
  protected readonly contextTooltip = { enable: true, format: '${point.x}: ${point.y}%' };
  protected readonly sampleTooltip = { enable: true, format: '${point.x}: ${point.y} MD' };
  protected readonly palette = ['#7eb6ff', '#3ec6e0', '#f0b429', '#8fd0c6', '#ff8b7a', '#c4b5fd'];
  protected readonly target = INDEX_TARGET;
  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px', color: '#d7e7f5' };
  protected readonly categoryAxis = {
    valueType: 'Category',
    majorGridLines: { width: 0 },
    labelStyle: this.axisFont,
  };
  protected readonly percentAxis = {
    minimum: 0,
    title: 'เปอร์เซ็นต์',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };
  protected readonly quotaAxis = {
    minimum: 0,
    title: 'MD',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };
  protected readonly chartTooltip = { enable: true, shared: true };
  protected readonly chartLegend = { visible: true, position: 'Top', textStyle: this.axisFont };
  protected readonly chartArea = { border: { width: 0 } };
  protected readonly targetMarker = { visible: true, width: 7, height: 7, fill: '#f0b429' };

  protected readonly alerts = this.scorecard.alerts;
  protected readonly explanations = computed(() => kpiExplanations(this.scorecard.tickets(), this.scorecard.people()));

  protected readonly viewingLive = computed(() => this.periodMode() === LIVE_MODE);

  protected readonly periodOptions = computed(() => [
    { text: 'ปัจจุบัน (คำนวณสด)', value: LIVE_MODE },
    ...this.periods().map((period) => ({
      text: `${period.periodType === 'month' ? 'เดือน' : 'ไตรมาส'} ${period.periodKey} · ${period.rowCount} คน`,
      value: `${period.periodType}|${period.periodKey}`,
    })),
  ]);

  protected readonly monthlyPoints = computed(() =>
    monthlyTrend(this.scorecard.people(), this.scorecard.tickets(), this.track()),
  );
  protected readonly quotaPoints = computed(() =>
    quotaBars(this.scorecard.people(), this.scorecard.tickets(), this.track()),
  );

  protected readonly samplePoints = computed(() =>
    sampleWorkloadPoints(this.scorecard.tickets(), this.track()),
  );

  protected readonly sampleSummary = computed(() => {
    const track = this.track();
    const tickets = this.scorecard
      .tickets()
      .filter((ticket) => track === 'All' || ticket.track === track);
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

  protected setTrack(event: { value?: string | null }): void {
    const value = event.value;
    if (value === 'All' || value === 'RD' || value === 'Implement') {
      this.track.set(value);
    }
  }

  protected setPeriodMode(event: { value?: string | null }): void {
    const value = event.value ?? LIVE_MODE;
    this.periodMode.set(value);
    if (value === LIVE_MODE) {
      this.snapshotRows.set([]);
      this.snapshotError.set('');
      return;
    }
    const [periodType, periodKey] = value.split('|') as [KpiPeriodType, string];
    void this.loadSnapshot(periodType, periodKey);
  }

  protected setCaptureType(event: { value?: string | null }): void {
    if (event.value === 'month' || event.value === 'quarter') {
      this.captureType.set(event.value);
    }
  }

  protected onCaptureKey(event: { value?: string | null }): void {
    this.captureKey.set((event.value ?? '').trim());
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
        this.notice.show(text);
        return;
      }
      const text = `จับ snapshot ${periodType} ${periodKey} แล้ว ${result.count ?? 0} คน`;
      this.snapshotMessage.set(text);
      this.notice.show(text);
      await this.reloadPeriods();
      this.periodMode.set(`${periodType}|${periodKey}`);
      await this.loadSnapshot(periodType, periodKey);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'จับ snapshot ไม่สำเร็จ';
      this.snapshotError.set(text);
      this.notice.show(text);
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

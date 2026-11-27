import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { AnalyticsReport, buildAnalyticsReport } from '../../core/analytics';
import { ApiClient } from '../../core/api-client';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { KpiStatCardComponent } from '../../shared/kpi-stat-card/kpi-stat-card';
import { PageHeadComponent, PersonAvatarComponent, SectionCardComponent } from '../../shared/ui';
import { SfChartComponent, SfChartOptions, SfChartSeriesConfig } from '../../shared/sf/sf-chart/sf-chart';
import {
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
} from '../../shared/sf/sf-grid/sf-grid';
import { SfMessageComponent } from '../../shared/sf/sf-message/sf-message';
import { SfTabItem, SfTabsComponent } from '../../shared/sf/sf-tabs/sf-tabs';

@Component({
  selector: 'app-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    PageHeadComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    KpiStatCardComponent,
    RouterLink,
    SfChartComponent,
    SfGridComponent,
    SfMessageComponent,
    SfTabsComponent,
  ],
  templateUrl: './analytics.html',
})
export class AnalyticsPage {
  private readonly scorecard = inject(ScorecardService);
  private readonly workspace = inject(WorkspaceFilter);
  private readonly api = inject(ApiClient, { optional: true });
  private readonly notice = inject(ShellNotice);
  protected readonly theme = inject(ThemeService);

  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' };
  protected readonly categoryAxis = {
    valueType: 'Category' as const,
    majorGridLines: { width: 0 },
    labelStyle: this.axisFont,
  };
  protected readonly countAxis = {
    minimum: 0,
    title: 'จำนวน / รอบ',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };

  protected readonly analyticsTabs = computed<SfTabItem[]>(() => [
    { id: 'hygiene', header: `1. ตรวจสอบข้อมูลซิงก์ & Outliers (${this.report().syncHygiene.issueCount})` },
    { id: 'risks', header: `2. เรดาร์ติดตามความเสี่ยงใบงานเปิด (${this.report().deliveryRisks.length})` },
    { id: 'coaching', header: '3. วิเคราะห์พัฒนาการ & โค้ชรายคน (1-on-1 Coaching)' },
    { id: 'bottlenecks', header: '4. วิเคราะห์งานค้าง & จุดติดขัดโมดูล (Bottlenecks)' },
  ]);

  protected readonly hygieneColumns: SfGridColumn[] = [
    { field: 'ticketId', headerText: 'รหัสใบงาน', width: 120 },
    { field: 'title', headerText: 'ชื่องาน / โมดูล', width: 200 },
    { field: 'trackLabel', headerText: 'สายงาน', width: 110 },
    { field: 'assignee', headerText: 'ผู้รับผิดชอบ', width: 180 },
    { field: 'severity', headerText: 'ระดับความสำคัญ', width: 130 },
    { field: 'issueType', headerText: 'ชนิดประเด็น', width: 160 },
    { field: 'detail', headerText: 'รายละเอียดสิ่งที่ตรวจพบ', width: 360 },
  ];
  protected readonly hygieneGridOptions: SfGridOptions = listGridOptions({
    id: 'hygiene-issues-grid',
    height: '360',
    filtering: 'Excel',
    columnChooser: true,
    excelExport: true,
    csvExport: true,
    exportFileName: 'sync-hygiene-issues',
  });

  protected readonly riskColumns: SfGridColumn[] = [
    { field: 'ticketId', headerText: 'รหัสใบงาน', width: 120 },
    { field: 'title', headerText: 'เรื่อง', width: 200 },
    { field: 'assignee', headerText: 'ผู้รับผิดชอบ', width: 130 },
    { field: 'status', headerText: 'สถานะ', width: 130 },
    { field: 'estimateMd', headerText: 'Est MD', width: 95, textAlign: 'Right', format: 'N2' },
    { field: 'actualMd', headerText: 'Actual MD', width: 105, textAlign: 'Right', format: 'N2' },
    { field: 'riskScore', headerText: 'Risk Score', width: 110, textAlign: 'Right' },
    { field: 'riskLevel', headerText: 'ระดับความเสี่ยง', width: 130 },
  ];
  protected readonly riskGridOptions: SfGridOptions = listGridOptions({
    id: 'delivery-risk-grid',
    height: '360',
    excelExport: true,
    exportFileName: 'delivery-risks',
  });

  protected readonly coachingColumns: SfGridColumn[] = [
    { field: 'nickname', headerText: 'พนักงาน', width: 175 },
    { field: 'trackLabel', headerText: 'สายงาน', width: 105 },
    { field: 'developmentIndex', headerText: 'ดัชนีพัฒนา', width: 105, textAlign: 'Right', format: 'N1' },
    { field: 'trendSlope', headerText: 'Slope แนวโน้ม', width: 120, textAlign: 'Right', format: 'N2' },
    { field: 'trendLabel', headerText: 'สถานะแนวโน้ม', width: 190 },
    { field: 'onTimePct', headerText: 'ตรงสัปดาห์ %', width: 120, textAlign: 'Right', format: 'N1' },
    { field: 'estimationAccuracyPct', headerText: 'แม่นขนาด %', width: 115, textAlign: 'Right', format: 'N1' },
    { field: 'firstPassPct', headerText: 'ผ่านรอบแรก %', width: 125, textAlign: 'Right', format: 'N1' },
    { field: 'strengthNote', headerText: 'จุดแข็งที่พบ', width: 240 },
    { field: 'coachingFocus', headerText: 'คำแนะนำสำหรับการโค้ช (1-on-1)', width: 340 },
  ];
  protected readonly coachingGridOptions: SfGridOptions = listGridOptions({
    id: 'coaching-insights-grid',
    height: '400',
    columnChooser: true,
    excelExport: true,
    csvExport: true,
    exportFileName: 'coaching-insights',
  });

  protected readonly bottleneckSeries = computed<SfChartSeriesConfig[]>(() => {
    const mods = this.report().bottlenecks.modules;
    return [
      { type: 'Column', dataSource: mods, xName: 'module', yName: 'avgReviewRounds', name: 'รอบรีวิวเฉลี่ย', fill: '#7c3aed', columnWidth: 0.45, cornerRadius: { topLeft: 4, topRight: 4 } },
      { type: 'Column', dataSource: mods, xName: 'module', yName: 'reopenTotal', name: 'จำนวน Reopen รวม', fill: '#e11d48', columnWidth: 0.45, cornerRadius: { topLeft: 4, topRight: 4 } },
    ];
  });
  protected readonly bottleneckChartOptions: SfChartOptions = {
    height: '280px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'bottleneck-modules',
    enableAnimation: true,
    legend: { visible: true, position: 'Top', alignment: 'Center', textStyle: this.axisFont },
    tooltip: { enable: true, shared: true, enableMarker: true, header: '${point.x}', format: '${series.name}: <b>${point.y}</b>' },
  };

  protected readonly bottleneckColumns: SfGridColumn[] = [
    { field: 'module', headerText: 'โมดูล / ระบบงาน', width: 180 },
    { field: 'ticketCount', headerText: 'จำนวนใบงาน', width: 120, textAlign: 'Right' },
    { field: 'avgReviewRounds', headerText: 'รอบรีวิวเฉลี่ย', width: 130, textAlign: 'Right', format: 'N2' },
    { field: 'reopenTotal', headerText: 'Reopen รวม', width: 120, textAlign: 'Right' },
    { field: 'avgRatio', headerText: 'Actual/Est เฉลี่ย', width: 140, textAlign: 'Right', format: 'N2' },
    { field: 'slipRatePct', headerText: 'อัตราหลุดสัปดาห์ %', width: 150, textAlign: 'Right', format: 'N1' },
  ];
  protected readonly bottleneckGridOptions: SfGridOptions = listGridOptions({
    id: 'bottleneck-module-grid',
    height: '260',
    excelExport: true,
    exportFileName: 'bottleneck-modules',
  });

  protected readonly running = signal(false);
  protected readonly message = signal('');
  protected readonly remoteReport = signal<AnalyticsReport | null>(null);

  private readonly scopedRoster = computed(() => this.workspace.applyToPeople(this.scorecard.roster()));
  private readonly scopedTickets = computed(() =>
    this.workspace.applyToTickets(this.scorecard.tickets()),
  );

  protected readonly report = computed<AnalyticsReport>(() => {
    const remote = this.remoteReport();
    const hasFilter =
      Boolean(this.workspace.teamId()) ||
      this.workspace.track() !== 'All' ||
      Boolean(this.workspace.personId()) ||
      Boolean(this.workspace.opProject()) ||
      Boolean(this.workspace.cycleId()) ||
      Boolean(this.workspace.fromDate()) ||
      Boolean(this.workspace.toDate()) ||
      this.workspace.yearCe() != null;
    if (remote && !hasFilter) {
      return remote;
    }
    return buildAnalyticsReport(this.scopedRoster(), this.scopedTickets(), 'typescript-fallback');
  });

  protected readonly highRiskCount = computed(
    () => this.report().deliveryRisks.filter((r) => r.riskLevel === 'สูงมาก').length,
  );

  constructor() {
    void this.scorecard.whenReady().then(() => this.fetchReport());
  }

  protected async fetchReport(): Promise<void> {
    if (!this.api || !this.scorecard.usingApi()) {
      return;
    }
    try {
      const res = await this.api.getAnalyticsReport();
      this.remoteReport.set(res);
    } catch {
      // Keep local reactive report
    }
  }

  protected async runPythonNow(): Promise<void> {
    this.running.set(true);
    this.message.set('');
    try {
      if (this.api && this.scorecard.usingApi()) {
        const res = await this.api.runAnalytics();
        this.remoteReport.set(res);
        const text = `รันวิเคราะห์ด้วย ${res.engine === 'python' ? 'Python Engine' : 'TypeScript Engine'} สำเร็จ · ความพร้อมข้อมูล ${res.syncHygiene.readinessScore}%`;
        this.message.set(text);
        this.notice.success(text);
      } else {
        const local = buildAnalyticsReport(this.scopedRoster(), this.scopedTickets(), 'typescript-fallback');
        this.remoteReport.set(local);
        const text = `คำนวณวิเคราะห์ชุดข้อมูลปัจจุบันแล้ว · ความพร้อมข้อมูล ${local.syncHygiene.readinessScore}% (พบ ${local.syncHygiene.issueCount} รายการต้องตรวจสอบ)`;
        this.message.set(text);
        this.notice.success(text);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'รันวิเคราะห์ข้อมูลไม่สำเร็จ';
      this.message.set(msg);
      this.notice.error(msg, 'วิเคราะห์ข้อมูลไม่สำเร็จ');
    } finally {
      this.running.set(false);
    }
  }
}

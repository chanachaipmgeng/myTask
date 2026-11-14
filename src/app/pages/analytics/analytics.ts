import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  CategoryService,
  ChartModule,
  ColumnSeriesService,
  LegendService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import {
  AggregateService,
  ColumnChooserService,
  ExcelExportService,
  FilterService,
  GridModule,
  PageService,
  ResizeService,
  SortService,
  ToolbarService,
} from '@syncfusion/ej2-angular-grids';
import { TabModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { ProgressBarModule } from '@syncfusion/ej2-angular-progressbar';
import { AnalyticsReport, buildAnalyticsReport } from '../../core/analytics';
import { ApiClient } from '../../core/api-client';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';

@Component({
  selector: 'app-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    ChartModule,
    GridModule,
    TabModule,
    MessageModule,
    ProgressBarModule,
    RouterLink,
  ],
  providers: [
    CategoryService,
    ColumnSeriesService,
    LegendService,
    TooltipService,
    PageService,
    SortService,
    FilterService,
    ResizeService,
    ColumnChooserService,
    ExcelExportService,
    AggregateService,
    ToolbarService,
  ],
  templateUrl: './analytics.html',
})
export class AnalyticsPage {
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient, { optional: true });
  private readonly notice = inject(ShellNotice);

  protected readonly pageSettings = { pageSize: 10 };
  protected readonly gridToolbar = ['ColumnChooser', 'ExcelExport', 'CsvExport'];
  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px', color: '#d7e7f5' };
  protected readonly categoryAxis = {
    valueType: 'Category',
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
  protected readonly tooltip = { enable: true, shared: true };
  protected readonly legend = { visible: true, position: 'Top', textStyle: this.axisFont };
  protected readonly chartArea = { border: { width: 0 } };

  protected readonly running = signal(false);
  protected readonly message = signal('');
  protected readonly remoteReport = signal<AnalyticsReport | null>(null);

  protected readonly report = computed<AnalyticsReport>(() => {
    const remote = this.remoteReport();
    if (remote) {
      return remote;
    }
    return buildAnalyticsReport(this.scorecard.roster(), this.scorecard.tickets(), 'python');
  });

  protected readonly highRiskCount = computed(
    () => this.report().deliveryRisks.filter((r) => r.riskLevel === 'สูงมาก').length,
  );

  constructor() {
    void this.fetchReport();
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
        const text = `รันวิเคราะห์ด้วย ${res.engine === 'python' ? 'Python Engine' : 'Fallback Engine'} สำเร็จ · ความพร้อมข้อมูล ${res.syncHygiene.readinessScore}%`;
        this.message.set(text);
        this.notice.show(text);
      } else {
        const local = buildAnalyticsReport(this.scorecard.roster(), this.scorecard.tickets(), 'python');
        this.remoteReport.set(local);
        const text = `คำนวณวิเคราะห์ชุดข้อมูลปัจจุบันแล้ว · ความพร้อมข้อมูล ${local.syncHygiene.readinessScore}% (พบ ${local.syncHygiene.issueCount} รายการต้องตรวจสอบ)`;
        this.message.set(text);
        this.notice.show(text);
      }
    } finally {
      this.running.set(false);
    }
  }
}

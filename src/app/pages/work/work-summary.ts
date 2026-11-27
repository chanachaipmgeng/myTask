import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { openprojectProjectCatalog } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { ThemeService } from '../../core/theme.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { groupOpenWorkByDueBucket, workSummaryStats } from '../../core/work-views';
import {
  FilterChipOption,
  FilterChipsComponent,
  HeroBandComponent,
  HeroBandMetric,
  SectionCardComponent,
  StatusBadgeComponent,
  prismChartPalette,
  trackHexColor,
  wipLoadHexColor,
  workflowStageHexColor,
  workflowStatusToneMap,
} from '../../shared/ui';
import { SfChartComponent, SfChartOptions, SfChartSeriesConfig } from '../../shared/sf/sf-chart/sf-chart';
import { SfDonutChartComponent, SfDonutChartOptions } from '../../shared/sf/sf-donut-chart/sf-donut-chart';
import { SfMessageComponent } from '../../shared/sf/sf-message/sf-message';
import { WorkHubFilter } from './work-hub-filter';

@Component({
  selector: 'app-work-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FilterChipsComponent,
    HeroBandComponent,
    SectionCardComponent,
    ButtonModule,
    StatusBadgeComponent,
    SfChartComponent,
    SfDonutChartComponent,
    SfMessageComponent,
  ],
  templateUrl: './work-summary.html',
  styleUrl: './work-summary.scss',
})
export class WorkSummary {
  private readonly scorecard = inject(ScorecardService);
  private readonly hub = inject(WorkHubFilter);
  private readonly ticketDetail = inject(TicketDetailService);
  protected readonly theme = inject(ThemeService);
  protected readonly workflowStatusToneMap = workflowStatusToneMap;

  protected readonly palette = ['#4c68e5', '#3ec6e0', '#f0b429', '#7465e8', '#e35d6a', '#8fd0c6', '#94a3b8'];

  protected readonly summaryTab = signal<'buckets' | 'charts'>('buckets');
  protected readonly selectedBucket = signal<string>('');
  protected readonly projectPage = signal<number>(1);
  protected readonly projectPageSize = 6;

  protected readonly summaryTabOptions = computed<FilterChipOption[]>(() => [
    { id: 'buckets', label: 'งานค้างตามวันส่ง', count: this.openGrouped().totalOpen },
    { id: 'charts', label: 'กราฟสถานะ · สายงาน · WIP' },
  ]);

  protected readonly view = computed(() =>
    workSummaryStats(
      this.scorecard.tickets(),
      this.scorecard.people(),
      this.hub.filterOptions(this.scorecard.people()),
    ),
  );

  protected readonly openGrouped = computed(() =>
    groupOpenWorkByDueBucket(
      this.scorecard.tickets(),
      this.scorecard.people(),
      this.hub.filterOptions(this.scorecard.people()),
    ),
  );

  private readonly projectNameMap = computed(() => {
    const map = new Map<string, string>();
    for (const p of openprojectProjectCatalog()) {
      if (p.id != null) map.set(String(p.id), p.name || p.identifier);
      if (p.identifier) map.set(p.identifier.toLowerCase(), p.name || p.identifier);
    }
    return map;
  });

  protected resolveProjectTitle(projectKey: string, fallback: string): string {
    const map = this.projectNameMap();
    return (
      map.get(projectKey) ??
      map.get(projectKey.toLowerCase()) ??
      map.get(fallback) ??
      map.get(fallback.toLowerCase()) ??
      fallback
    );
  }

  protected readonly bucketChipOptions = computed<FilterChipOption[]>(() =>
    this.openGrouped().buckets.map((b) => ({
      id: b.bucket,
      label: b.label,
      count: b.count,
    })),
  );

  protected readonly activeBucket = computed(() => {
    const buckets = this.openGrouped().buckets;
    if (buckets.length === 0) return null;
    const chosen = this.selectedBucket();
    return buckets.find((b) => b.bucket === chosen) ?? buckets[0]!;
  });

  protected readonly projectTotalPages = computed(() => {
    const total = this.activeBucket()?.projects.length ?? 0;
    return Math.max(1, Math.ceil(total / this.projectPageSize));
  });

  protected readonly pagedProjects = computed(() => {
    const projects = this.activeBucket()?.projects ?? [];
    const page = Math.min(this.projectPage(), this.projectTotalPages());
    const start = (page - 1) * this.projectPageSize;
    return projects.slice(start, start + this.projectPageSize);
  });

  protected setSummaryTab(id: string): void {
    this.summaryTab.set(id === 'charts' ? 'charts' : 'buckets');
  }

  protected setBucket(id: string): void {
    this.selectedBucket.set(id);
    this.projectPage.set(1);
  }

  protected setProjectPage(page: number): void {
    if (page >= 1 && page <= this.projectTotalPages()) {
      this.projectPage.set(page);
    }
  }

  protected readonly summaryMetrics = computed((): HeroBandMetric[] =>
    this.view().cards.map((card) => ({
      label: card.label,
      value: card.value,
      hint: card.hint,
      tone: card.id === 'overdue' && card.value !== '0' ? 'bad' : 'neutral',
    })),
  );

  protected openTicket(id: string): void {
    this.ticketDetail.open(id);
  }

  protected readonly statusDonutOptions = computed<SfDonutChartOptions>(() => {
    const share = this.view().statusShare;
    const total = share.reduce((sum, row) => sum + row.y, 0);
    const dark = this.theme.isDark();
    const palettes = share.length
      ? share.map((row) => workflowStageHexColor(row.x, dark))
      : prismChartPalette(dark);
    return {
      height: '250px',
      innerRadius: '62%',
      radius: '82%',
      centerLabel: `${total}<br>ใบ`,
      palettes,
      legend: { visible: true, position: 'Right', alignment: 'Center' },
      exportable: true,
      exportFileName: 'work-status-donut',
    };
  });

  protected readonly trackDonutOptions = computed<SfDonutChartOptions>(() => {
    const share = this.view().trackShare;
    const total = share.reduce((sum, row) => sum + row.y, 0);
    const dark = this.theme.isDark();
    const palettes = share.length
      ? share.map((row) => trackHexColor(row.x, dark))
      : prismChartPalette(dark);
    return {
      height: '250px',
      innerRadius: '62%',
      radius: '82%',
      centerLabel: `${total}<br>ใบ`,
      palettes,
      legend: { visible: true, position: 'Right', alignment: 'Center' },
      exportable: true,
      exportFileName: 'work-track-donut',
    };
  });

  protected readonly wipChartSeries = computed<SfChartSeriesConfig[]>(() => {
    const dark = this.theme.isDark();
    const bars = this.view().wipBars.map((b) => ({
      ...b,
      barColor: wipLoadHexColor(b.openMd, dark),
    }));
    return [
      {
        type: 'Column',
        dataSource: bars,
        xName: 'nickname',
        yName: 'openMd',
        name: 'WIP MD',
        pointColorMapping: 'barColor',
        columnWidth: 0.45,
        cornerRadius: { topLeft: 8, topRight: 8 },
      },
    ];
  });

  protected readonly wipXAxis = { valueType: 'Category' as const, majorGridLines: { width: 0 } };
  protected readonly wipYAxis = {
    title: 'MD',
    opposedPosition: true,
    majorGridLines: { width: 1, dashArray: '4,4' },
    lineStyle: { width: 0 },
  };

  protected readonly wipChartOptions: SfChartOptions = {
    height: '250px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'work-wip-by-person',
    legend: { visible: false },
    enableAnimation: true,
  };

  protected readonly mdMandate = this.scorecard.mdMandateReport;
}

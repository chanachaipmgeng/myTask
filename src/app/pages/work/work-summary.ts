import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { ScorecardService } from '../../core/scorecard.service';
import { ThemeService } from '../../core/theme.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { groupOpenWorkByDueBucket, workSummaryStats } from '../../core/work-views';
import {
  HeroBandComponent,
  HeroBandMetric,
  SectionCardComponent,
  SfChartComponent,
  SfChartOptions,
  SfChartSeriesConfig,
  SfDonutChartComponent,
  SfDonutChartOptions,
  SfMessageComponent,
  StatusBadgeComponent,
  workflowStatusToneMap,
} from '../../shared/ui';
import { WorkHubFilter } from './work-hub-filter';

@Component({
  selector: 'app-work-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
    const total = this.view().statusShare.reduce((sum, row) => sum + row.y, 0);
    return {
      height: '270px',
      innerRadius: '62%',
      radius: '82%',
      centerLabel: `${total}<br>ใบ`,
      palettes: this.palette,
      legend: { visible: true, position: 'Right', alignment: 'Center' },
      exportable: true,
      exportFileName: 'work-status-donut',
    };
  });

  protected readonly trackDonutOptions = computed<SfDonutChartOptions>(() => {
    const total = this.view().trackShare.reduce((sum, row) => sum + row.y, 0);
    return {
      height: '270px',
      innerRadius: '62%',
      radius: '82%',
      centerLabel: `${total}<br>ใบ`,
      palettes: this.palette,
      legend: { visible: true, position: 'Right', alignment: 'Center' },
      exportable: true,
      exportFileName: 'work-track-donut',
    };
  });

  protected readonly wipChartSeries = computed<SfChartSeriesConfig[]>(() => [
    {
      type: 'Column',
      dataSource: this.view().wipBars,
      xName: 'nickname',
      yName: 'openMd',
      name: 'WIP MD',
      fill: '#2e4fc8',
      columnWidth: 0.45,
      cornerRadius: { topLeft: 8, topRight: 8 },
    },
  ]);

  protected readonly wipXAxis = { valueType: 'Category' as const, majorGridLines: { width: 0 } };
  protected readonly wipYAxis = {
    title: 'MD',
    opposedPosition: true,
    majorGridLines: { width: 1, dashArray: '4,4' },
    lineStyle: { width: 0 },
  };

  protected readonly wipChartOptions: SfChartOptions = {
    height: '280px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'work-wip-by-person',
    legend: { visible: false },
    enableAnimation: true,
  };

  protected readonly mdMandate = this.scorecard.mdMandateReport;
}

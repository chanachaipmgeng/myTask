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
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { DashboardLayoutModule } from '@syncfusion/ej2-angular-layouts';
import { monthlyTrend, quotaBars } from '../../core/dashboard-charts';
import { kpiExplanations } from '../../core/kpi-meaning';
import { ScorecardService } from '../../core/scorecard.service';
import { Track } from '../../core/models';
import { INDEX_TARGET, formatMd, sampleWorkloadPoints } from '../../core/scoring';
import { TEAM_CONTEXT_2568 } from '../../data/team-context';

type TrackFilter = Track | 'All';

@Component({
  selector: 'app-team-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayoutModule, AccumulationChartModule, ChartModule, DropDownListModule],
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

  protected readonly context = TEAM_CONTEXT_2568;
  protected readonly cellSpacing = [12, 12];
  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly trackOptions = [
    { text: 'ทั้งหมด', value: 'All' },
    { text: 'R&D', value: 'RD' },
    { text: 'Implement', value: 'Implement' },
  ];
  protected readonly track = signal<TrackFilter>('All');
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

  protected readonly tasksLabel = TEAM_CONTEXT_2568.tasks.toLocaleString('en-US');

  protected setTrack(event: { value?: string | null }): void {
    const value = event.value;
    if (value === 'All' || value === 'RD' || value === 'Implement') {
      this.track.set(value);
    }
  }
}

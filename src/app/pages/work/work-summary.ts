import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  QueryList,
  ViewChildren,
  computed,
  inject,
} from '@angular/core';
import {
  AccumulationChartComponent,
  AccumulationChartModule,
  AccumulationDataLabelService,
  AccumulationLegendService,
  AccumulationTooltipService,
  CategoryService,
  ChartComponent,
  ChartModule,
  ColumnSeriesService,
  LegendService,
  PieSeriesService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { DashboardLayoutModule } from '@syncfusion/ej2-angular-layouts';
import { ScorecardService } from '../../core/scorecard.service';
import { workSummaryStats } from '../../core/work-views';
import { WorkHubFilter } from './work-hub-filter';

@Component({
  selector: 'app-work-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayoutModule, AccumulationChartModule, ChartModule],
  providers: [
    PieSeriesService,
    AccumulationLegendService,
    AccumulationTooltipService,
    AccumulationDataLabelService,
    CategoryService,
    ColumnSeriesService,
    LegendService,
    TooltipService,
  ],
  templateUrl: './work-summary.html',
})
export class WorkSummary implements AfterViewInit {
  private readonly scorecard = inject(ScorecardService);
  private readonly hub = inject(WorkHubFilter);
  private readonly el = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChildren(AccumulationChartComponent) private readonly accCharts!: QueryList<AccumulationChartComponent>;
  @ViewChildren(ChartComponent) private readonly charts!: QueryList<ChartComponent>;

  protected readonly cellSpacing = [12, 12];
  protected readonly legend = { visible: true, position: 'Bottom' as const };
  protected readonly tooltip = { enable: true };
  protected readonly chartArea = { border: { width: 0 } };
  protected readonly categoryAxis = { valueType: 'Category' as const, majorGridLines: { width: 0 } };
  protected readonly valueAxis = { title: 'MD', majorGridLines: { width: 0 } };
  protected readonly statusLabel = {
    visible: true,
    name: 'text',
    position: 'Outside' as const,
    font: { size: '11px' },
  };
  protected readonly palette = ['#479ef5', '#62bfff', '#54b054', '#f0b429', '#eeacb2', '#a78bfa', '#94a3b8'];

  protected readonly view = computed(() =>
    workSummaryStats(this.scorecard.tickets(), this.scorecard.people(), {
      track: this.hub.track(),
      query: this.hub.query(),
    }),
  );

  ngAfterViewInit(): void {
    this.scheduleChartRefresh();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        this.scheduleChartRefresh();
      });
      observer.observe(this.el.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
  }

  protected onDashboardCreated(): void {
    this.scheduleChartRefresh();
  }

  private scheduleChartRefresh(): void {
    setTimeout(() => {
      this.refreshCharts();
    }, 50);
    setTimeout(() => {
      this.refreshCharts();
    }, 200);
  }

  private refreshCharts(): void {
    this.accCharts?.forEach((chart) => {
      try {
        chart.refresh();
      } catch {}
    });
    this.charts?.forEach((chart) => {
      try {
        chart.refresh();
      } catch {}
    });
  }
}

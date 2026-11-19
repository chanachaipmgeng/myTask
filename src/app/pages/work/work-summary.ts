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
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { ScorecardService } from '../../core/scorecard.service';
import { ThemeService } from '../../core/theme.service';
import { workSummaryStats } from '../../core/work-views';
import { HeroBandComponent, HeroBandMetric } from '../../shared/ui/hero-band/hero-band';
import { WorkHubFilter } from './work-hub-filter';

@Component({
  selector: 'app-work-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayoutModule, AccumulationChartModule, ChartModule, HeroBandComponent, MessageModule],
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
  protected readonly theme = inject(ThemeService);

  @ViewChildren(AccumulationChartComponent) private readonly accCharts!: QueryList<AccumulationChartComponent>;
  @ViewChildren(ChartComponent) private readonly charts!: QueryList<ChartComponent>;

  protected readonly cellSpacing = [12, 12];
  protected readonly legend = {
    visible: true,
    position: 'Right' as const,
    alignment: 'Center' as const,
    shape: 'Circle' as const,
    textStyle: { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' },
  };
  protected readonly tooltip = {
    enable: true,
    shared: true,
    header: '${point.x}',
    format: '${series.name}: <b>${point.y}</b>',
  };
  protected readonly pieTooltip = {
    enable: true,
    format: '${point.x}: <b>${point.y}</b>',
  };
  protected readonly chartArea = { border: { width: 0 } };
  protected readonly columnCorner = { topLeft: 4, topRight: 4 };
  protected readonly categoryAxis = { valueType: 'Category' as const, majorGridLines: { width: 0 } };
  protected readonly valueAxis = { title: 'MD', majorGridLines: { width: 0 } };
  protected readonly donutLabel = { visible: false };
  protected readonly centerTextStyle = computed(() => ({
    fontFamily: 'Sarabun, Tahoma, sans-serif',
    fontWeight: '700',
    size: '15px',
    color: this.theme.isDark() ? '#e2e8f0' : '#1e293b',
  }));
  protected readonly palette = ['#4c68e5', '#3ec6e0', '#f0b429', '#7465e8', '#e35d6a', '#8fd0c6', '#94a3b8'];

  protected readonly view = computed(() =>
    workSummaryStats(this.scorecard.tickets(), this.scorecard.people(), this.hub.filterOptions()),
  );

  protected readonly summaryMetrics = computed((): HeroBandMetric[] =>
    this.view().cards.map((card) => ({
      label: card.label,
      value: card.value,
      hint: card.hint,
      tone: card.id === 'overdue' && card.value !== '0' ? 'bad' : 'neutral',
    })),
  );

  protected readonly statusCenter = computed(() => {
    const total = this.view().statusShare.reduce((sum, row) => sum + row.y, 0);
    return { text: `${total}<br>ใบ`, textStyle: this.centerTextStyle() };
  });

  protected readonly trackCenter = computed(() => {
    const total = this.view().trackShare.reduce((sum, row) => sum + row.y, 0);
    return { text: `${total}<br>ใบ`, textStyle: this.centerTextStyle() };
  });

  protected cardIcon(id: string): string {
    switch (id) {
      case 'open':
        return 'e-folder-open';
      case 'closed':
        return 'e-circle-check';
      case 'overdue':
        return 'e-warning';
      case 'unplanned':
        return 'e-clock';
      default:
        return 'e-chart';
    }
  }

  protected cardAccent(id: string): 'info' | 'success' | 'warning' | 'danger' {
    switch (id) {
      case 'closed':
        return 'success';
      case 'overdue':
        return 'danger';
      case 'unplanned':
        return 'warning';
      default:
        return 'info';
    }
  }

  protected readonly mdMandate = this.scorecard.mdMandateReport;

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

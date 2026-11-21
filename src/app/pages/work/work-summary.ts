import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  QueryList,
  ViewChild,
  ViewChildren,
  computed,
  inject,
  signal,
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
import { DashboardLayoutComponent, DashboardLayoutModule } from '@syncfusion/ej2-angular-layouts';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { ScorecardService } from '../../core/scorecard.service';
import { ThemeService } from '../../core/theme.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { groupOpenWorkByDueBucket, workSummaryStats } from '../../core/work-views';
import { HeroBandComponent, HeroBandMetric } from '../../shared/ui/hero-band/hero-band';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';
import { StatusBadgeComponent, workflowStatusToneMap } from '../../shared/ui';
import { WorkHubFilter } from './work-hub-filter';

@Component({
  selector: 'app-work-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AccumulationChartModule,
    ChartModule,
    HeroBandComponent,
    SectionCardComponent,
    MessageModule,
    ButtonModule,
    StatusBadgeComponent,
  ],
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
  styleUrl: './work-summary.scss',
})
export class WorkSummary implements AfterViewInit {
  private readonly scorecard = inject(ScorecardService);
  private readonly hub = inject(WorkHubFilter);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly el = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly theme = inject(ThemeService);
  protected readonly workflowStatusToneMap = workflowStatusToneMap;

  @ViewChild(DashboardLayoutComponent) private dashboard?: DashboardLayoutComponent;

  @ViewChildren(AccumulationChartComponent) private readonly accCharts!: QueryList<AccumulationChartComponent>;
  @ViewChildren(ChartComponent) private readonly charts!: QueryList<ChartComponent>;

  protected readonly cellSpacing = [12, 12];
  /** จอกว้าง: ช่องเกือบจัตุรัส · จอแคบที่เรียงแผงทีละใบ: ช่องแบนลงให้พอดีกราฟ 260px */
  protected readonly cellAspectRatio = signal(1.25);
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
  protected readonly columnCorner = { topLeft: 8, topRight: 8 };
  protected readonly categoryAxis = { valueType: 'Category' as const, majorGridLines: { width: 0 } };
  protected readonly valueAxis = {
    title: 'MD',
    opposedPosition: true,
    majorGridLines: { width: 1, dashArray: '4,4' },
    lineStyle: { width: 0 },
  };
  protected readonly donutLabel = { visible: false };
  protected readonly centerTextStyle = computed(() => ({
    fontFamily: 'Sarabun, Tahoma, sans-serif',
    fontWeight: '700',
    size: '15px',
    color: this.theme.isDark() ? '#e2e8f0' : '#1e293b',
  }));
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
    this.fitCellAspect();
    this.scheduleChartRefresh();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        this.zone.run(() => {
          this.fitCellAspect();
          this.scheduleChartRefresh();
        });
      });
      observer.observe(this.el.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
  }

  protected onDashboardCreated(): void {
    this.fitCellAspect();
    this.scheduleChartRefresh();
  }

  /** บนจอแคบ DashboardLayout เรียงทีละแผงเต็มความกว้าง แต่ sizeY ยังเป็น 2 ทำให้แผงสูงกว่ากราฟหลายเท่า */
  private fitCellAspect(): void {
    const narrow = window.matchMedia('(max-width: 800px)').matches;
    const width = this.el.nativeElement.clientWidth || window.innerWidth;
    const next = narrow ? Math.max(2.4, width / 170) : 1.25;
    const rounded = Math.round(next * 100) / 100;
    if (Math.abs(this.cellAspectRatio() - rounded) < 0.08) {
      return;
    }
    this.cellAspectRatio.set(rounded);
    this.cdr.markForCheck();
    setTimeout(() => this.dashboard?.refresh(), 0);
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

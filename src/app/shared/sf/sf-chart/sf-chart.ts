import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  AreaSeriesService,
  AxisModel,
  BarSeriesService,
  CategoryService,
  ChartComponent,
  ChartModule,
  ColumnSeriesService,
  CrosshairService,
  CrosshairSettingsModel,
  DataLabelService,
  DateTimeService,
  ExportService,
  LegendService,
  LegendSettingsModel,
  LineSeriesService,
  PolarSeriesService,
  RadarSeriesService,
  ScatterSeriesService,
  SplineAreaSeriesService,
  SplineSeriesService,
  StackingAreaSeriesService,
  StackingBarSeriesService,
  StackingColumnSeriesService,
  StripLineService,
  TooltipService,
  TooltipSettingsModel,
  ZoomService,
  ZoomSettingsModel,
} from '@syncfusion/ej2-angular-charts';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { ThemeService } from '../../../core/theme.service';

export interface SfChartSeriesConfig {
  type:
    | 'Column'
    | 'Bar'
    | 'Line'
    | 'Spline'
    | 'Area'
    | 'SplineArea'
    | 'StackingColumn'
    | 'StackingBar'
    | 'StackingArea'
    | 'Scatter'
    | 'Radar'
    | 'Polar';
  dataSource: object[];
  xName: string;
  yName: string;
  name?: string;
  fill?: string;
  pointColorMapping?: string;
  yAxisName?: string;
  columnWidth?: number;
  width?: number;
  dashArray?: string;
  opacity?: number;
  cornerRadius?: { topLeft?: number; topRight?: number; bottomLeft?: number; bottomRight?: number };
  marker?: object;
  drawType?: 'Line' | 'Area' | 'Column' | 'Scatter';
}

export interface SfChartOptions {
  height?: string;
  title?: string;
  exportable?: boolean;
  exportFileName?: string;
  zoomable?: boolean;
  crosshair?: boolean;
  fullscreenable?: boolean;
  enableAnimation?: boolean;
  legend?: LegendSettingsModel;
  tooltip?: TooltipSettingsModel;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  axes?: AxisModel[];
}

@Component({
  selector: 'app-sf-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartModule, ButtonModule],
  providers: [
    CategoryService,
    DateTimeService,
    ColumnSeriesService,
    BarSeriesService,
    LineSeriesService,
    SplineSeriesService,
    AreaSeriesService,
    SplineAreaSeriesService,
    StackingColumnSeriesService,
    StackingBarSeriesService,
    StackingAreaSeriesService,
    ScatterSeriesService,
    RadarSeriesService,
    PolarSeriesService,
    LegendService,
    TooltipService,
    DataLabelService,
    StripLineService,
    ZoomService,
    CrosshairService,
    ExportService,
  ],
  template: `
    <div #hostBox class="sf-chart-wrap" [class.is-fullscreen]="fullscreen()">
      @if (showControls()) {
        <div class="sf-chart-toolbar">
          @if (options().exportable) {
            <button
              ejs-button
              cssClass="e-small e-flat"
              iconCss="e-icons e-export"
              type="button"
              title="ส่งออกกราฟเป็น PNG"
              (click)="exportPng()"
            >
              PNG
            </button>
          }
          @if (options().fullscreenable) {
            <button
              ejs-button
              cssClass="e-small e-flat sf-chart-icon-btn"
              type="button"
              [title]="fullscreen() ? 'ปิดเต็มจอ' : 'ขยายกราฟเต็มจอ'"
              [attr.aria-label]="fullscreen() ? 'ปิดเต็มจอ' : 'ขยายกราฟเต็มจอ'"
              (click)="toggleFullscreen()"
            >
              @if (fullscreen()) {
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              } @else {
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              }
            </button>
          }
        </div>
      }

      <ejs-chart
        #chartRef
        style="display: block; width: 100%"
        [style.height]="fullscreen() ? 'calc(100vh - 96px)' : resolvedHeight()"
        background="transparent"
        [theme]="theme.sfTheme()"
        [palettes]="nordicPalettes"
        [title]="options().title ?? ''"
        [primaryXAxis]="primaryXAxis()"
        [primaryYAxis]="primaryYAxis()"
        [axes]="options().axes ?? []"
        [chartArea]="chartArea"
        [margin]="resolvedMargin()"
        [legendSettings]="resolvedLegend()"
        [tooltip]="resolvedTooltip()"
        [zoomSettings]="zoomSettings()"
        [crosshair]="crosshairSettings()"
        [enableAnimation]="options().enableAnimation ?? true"
      >
        <e-series-collection>
          @for (s of series(); track s.name || s.yName || $index) {
            <e-series
              [type]="s.type"
              [drawType]="s.drawType!"
              [dataSource]="s.dataSource"
              [xName]="s.xName"
              [yName]="s.yName"
              [name]="s.name!"
              [fill]="s.fill!"
              [pointColorMapping]="s.pointColorMapping!"
              [yAxisName]="s.yAxisName!"
              [columnWidth]="s.columnWidth ?? 0.56"
              [width]="s.width ?? 2.5"
              [dashArray]="s.dashArray!"
              [opacity]="s.opacity ?? 1"
              [cornerRadius]="s.cornerRadius ?? seriesCornerRadius(s)"
              [marker]="s.marker ?? {}"
            ></e-series>
          }
        </e-series-collection>
      </ejs-chart>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }
    .sf-chart-wrap {
      position: relative;
      width: 100%;
    }
    .sf-chart-wrap.is-fullscreen {
      position: fixed;
      inset: 16px;
      z-index: 1400;
      padding: 20px;
      border-radius: var(--radius-panel, 24px);
      background: var(--surface-glass-strong, #0f172a);
      backdrop-filter: blur(24px);
      border: 1px solid var(--border-glass);
      box-shadow: var(--shadow-floating);
    }
    .sf-chart-toolbar {
      position: absolute;
      top: -4px;
      right: 2px;
      z-index: 5;
      display: inline-flex;
      border-radius: 8px;
      background: var(--surface-glass-strong, rgba(255, 255, 255, 0.85));
      backdrop-filter: blur(8px);
      align-items: center;
      gap: 4px;
    }
  `,
})
export class SfChartComponent implements AfterViewInit, OnDestroy {
  protected readonly theme = inject(ThemeService);

  @ViewChild('chartRef') private chartRef?: ChartComponent;
  @ViewChild('hostBox') private hostBox?: ElementRef<HTMLElement>;

  readonly series = input<readonly SfChartSeriesConfig[]>([]);
  readonly primaryXAxis = input<AxisModel>({ valueType: 'Category' });
  readonly primaryYAxis = input<AxisModel>({});
  readonly options = input<SfChartOptions>({});

  protected readonly fullscreen = signal(false);
  protected readonly chartArea = { border: { width: 0 } };
  protected readonly nordicPalettes = ['#2e4fc8', '#38bdf8', '#10b981', '#6366f1', '#f59e0b', '#f43f5e'];
  protected readonly defaultCornerRadius = { topLeft: 8, topRight: 8 };
  protected readonly barCornerRadius = { topRight: 8, bottomRight: 8 };
  protected readonly flatCornerRadius = {};

  protected seriesCornerRadius(s: SfChartSeriesConfig): object {
    if (s.type === 'Column' || s.type === 'StackingColumn') return this.defaultCornerRadius;
    if (s.type === 'Bar' || s.type === 'StackingBar') return this.barCornerRadius;
    return this.flatCornerRadius;
  }

  private resizeObserver?: ResizeObserver;
  private resizeTimer?: ReturnType<typeof setTimeout>;

  protected readonly resolvedHeight = computed(() => this.options().height ?? '340px');
  protected readonly showControls = computed(
    () => Boolean(this.options().exportable || this.options().fullscreenable),
  );
  protected readonly resolvedMargin = computed(
    () => this.options().margin ?? { top: 14, right: 20, bottom: 20, left: 12 },
  );
  protected readonly resolvedLegend = computed<LegendSettingsModel>(() => ({
    visible: true,
    position: 'Top',
    enablePages: false,
    ...(this.options().legend ?? {}),
  }));
  protected readonly resolvedTooltip = computed<TooltipSettingsModel>(() => ({
    enable: true,
    shared: true,
    ...(this.options().tooltip ?? {}),
  }));
  protected readonly zoomSettings = computed<ZoomSettingsModel>(() =>
    this.options().zoomable
      ? { enableSelectionZooming: true, enableMouseWheelZooming: true, enablePan: true, mode: 'X' }
      : { enableSelectionZooming: false },
  );
  protected readonly crosshairSettings = computed<CrosshairSettingsModel>(() =>
    this.options().crosshair ? { enable: true, lineType: 'Vertical' } : { enable: false },
  );

  ngAfterViewInit(): void {
    if (typeof ResizeObserver !== 'undefined' && this.hostBox?.nativeElement) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.resizeTimer) clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
          this.chartRef?.refresh();
        }, 150);
      });
      this.resizeObserver.observe(this.hostBox.nativeElement);
    }
  }

  ngOnDestroy(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
  }

  exportPng(fileName?: string): void {
    this.chartRef?.exportModule?.export('PNG', fileName || this.options().exportFileName || 'chart');
  }

  toggleFullscreen(): void {
    this.fullscreen.update((v) => !v);
    setTimeout(() => this.chartRef?.refresh(), 100);
  }

  instance(): ChartComponent | undefined {
    return this.chartRef;
  }
}

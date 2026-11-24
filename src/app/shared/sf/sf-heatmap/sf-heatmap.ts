import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import {
  AdaptorService,
  HeatMapComponent,
  HeatMapModule,
  LegendService,
  TooltipService,
} from '@syncfusion/ej2-angular-heatmap';
import type { AxisModel, CellSettingsModel, DataModel, LegendSettingsModel, PaletteSettingsModel } from '@syncfusion/ej2-heatmap';
import { ThemeService } from '../../../core/theme.service';

export interface SfHeatmapCell {
  x: string;
  y: string;
  value: number;
}

export interface SfHeatmapOptions {
  height?: string;
  xTitle?: string;
  yTitle?: string;
}

const INDEX_PALETTE: PaletteSettingsModel = {
  type: 'Gradient',
  emptyPointColor: 'rgba(148, 163, 184, 0.16)',
  palette: [
    { value: 0, color: '#f43f5e', label: 'ต่ำ' },
    { value: 65, color: '#f59e0b', label: 'ต้องเร่ง' },
    { value: 80, color: '#0ea5e9', label: 'ผ่านเป้า' },
    { value: 100, color: '#10b981', label: 'ดีเยี่ยม' },
  ],
};

@Component({
  selector: 'app-sf-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HeatMapModule],
  providers: [LegendService, TooltipService, AdaptorService],
  template: `
    <div #hostBox class="sf-heatmap-wrap">
      <ejs-heatmap
        #heatRef
        style="display: block; width: 100%"
        [style.height]="resolvedHeight()"
        [theme]="theme.sfTheme()"
        backgroundColor="transparent"
        [dataSource]="matrix()"
        [dataSourceSettings]="dataSettings"
        [xAxis]="xAxis()"
        [yAxis]="yAxis()"
        [paletteSettings]="palette"
        [legendSettings]="legend"
        [cellSettings]="cellSettings"
        [tooltipSettings]="tooltipSettings"
        [showTooltip]="true"
        [allowSelection]="false"
      ></ejs-heatmap>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }
    .sf-heatmap-wrap {
      width: 100%;
    }
  `,
})
export class SfHeatmapComponent implements AfterViewInit, OnDestroy {
  protected readonly theme = inject(ThemeService);

  @ViewChild('heatRef') private heatRef?: HeatMapComponent;
  @ViewChild('hostBox') private hostBox?: ElementRef<HTMLElement>;

  readonly cells = input<readonly SfHeatmapCell[]>([]);
  readonly xLabels = input<readonly string[]>([]);
  readonly yLabels = input<readonly string[]>([]);
  readonly options = input<SfHeatmapOptions>({});

  protected readonly palette = INDEX_PALETTE;
  protected readonly dataSettings: DataModel = {
    isJsonData: true,
    adaptorType: 'Cell',
    xDataMapping: 'x',
    yDataMapping: 'y',
    valueMapping: 'value',
  };
  protected readonly legend: LegendSettingsModel = {
    position: 'Bottom',
    alignment: 'Center',
    textStyle: { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' },
  };
  protected readonly cellSettings: CellSettingsModel = {
    showLabel: true,
    format: 'N1',
    border: { width: 2, color: 'transparent' },
    textStyle: { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '11px' },
  };
  protected readonly tooltipSettings = {
    textStyle: { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' },
  };

  protected readonly matrix = computed(() =>
    this.cells().map((cell) => ({ x: cell.x, y: cell.y, value: cell.value })),
  );
  protected readonly resolvedHeight = computed(() => this.options().height ?? '360px');
  protected readonly xAxis = computed<AxisModel>(() => ({
    labels: [...this.xLabels()],
    valueType: 'Category',
    labelRotation: this.xLabels().length > 6 ? -35 : 0,
    labelIntersectAction: 'Rotate45',
    textStyle: { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' },
    title: {
      text: this.options().xTitle ?? '',
      textStyle: { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' },
    },
  }));
  protected readonly yAxis = computed<AxisModel>(() => ({
    labels: [...this.yLabels()],
    valueType: 'Category',
    isInversed: true,
    textStyle: { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' },
    title: {
      text: this.options().yTitle ?? '',
      textStyle: { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' },
    },
  }));

  private resizeObserver?: ResizeObserver;
  private resizeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      this.matrix();
      this.xLabels();
      this.yLabels();
      this.theme.sfTheme();
      queueMicrotask(() => this.heatRef?.refresh());
    });
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver !== 'undefined' && this.hostBox?.nativeElement) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.resizeTimer) clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => this.heatRef?.refresh(), 150);
      });
      this.resizeObserver.observe(this.hostBox.nativeElement);
    }
  }

  ngOnDestroy(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
  }
}

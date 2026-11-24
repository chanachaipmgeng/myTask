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
  output,
} from '@angular/core';
import {
  AccumulationChartComponent,
  AccumulationChartModule,
  AccumulationDataLabelService,
  AccumulationLegendService,
  AccumulationTooltipService,
  ExportService,
  IPointEventArgs,
  LegendSettingsModel,
  PieSeriesService,
  TooltipSettingsModel,
} from '@syncfusion/ej2-angular-charts';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { ThemeService } from '../../../core/theme.service';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';
import { prismChartPalette } from '../../ui/palette';

export interface SfDonutChartOptions {
  height?: string;
  innerRadius?: string;
  radius?: string;
  centerLabel?: string;
  centerSubLabel?: string;
  exportable?: boolean;
  exportFileName?: string;
  palettes?: string[];
  legend?: LegendSettingsModel;
  tooltip?: TooltipSettingsModel;
  enableSmartLabels?: boolean;
  motion?: MotionInput;
}

@Component({
  selector: 'app-sf-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AccumulationChartModule, ButtonModule, MotionWrapperComponent],
  providers: [
    PieSeriesService,
    AccumulationLegendService,
    AccumulationTooltipService,
    AccumulationDataLabelService,
    ExportService,
  ],
  template: `
    <app-motion-wrapper
      [config]="options().motion"
      variant="scale-glass"
      [refreshKey]="motionRefreshKey()"
    >
    <div #hostBox class="sf-donut-wrap">
      @if (options().exportable) {
        <button
          ejs-button
          class="sf-donut-export"
          cssClass="e-small e-flat"
          iconCss="e-icons e-export"
          type="button"
          title="ส่งออกกราฟเป็น PNG"
          (click)="exportPng()"
        >
          PNG
        </button>
      }
      <ejs-accumulationchart
        #donutRef
        style="display: block; width: 100%"
        [style.height]="options().height ?? '300px'"
        background="transparent"
        [theme]="theme.sfTheme()"
        [legendSettings]="resolvedLegend()"
        [tooltip]="resolvedTooltip()"
        [centerLabel]="centerLabelConfig()"
        [enableSmartLabels]="options().enableSmartLabels ?? true"
        [enableAnimation]="true"
        (pointClick)="pointClick.emit($event)"
      >
        <e-accumulation-series-collection>
          <e-accumulation-series
            [dataSource]="data()"
            [xName]="xName()"
            [yName]="yName()"
            [innerRadius]="options().innerRadius ?? '68%'"
            [radius]="options().radius ?? '86%'"
            [palettes]="options().palettes ?? defaultPalettes()"
            [border]="sliceBorder()"
            [dataLabel]="dataLabel"
          ></e-accumulation-series>
        </e-accumulation-series-collection>
      </ejs-accumulationchart>
    </div>
    </app-motion-wrapper>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .sf-donut-wrap {
      position: relative;
      width: 100%;
    }
    .sf-donut-export {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 5;
    }
  `,
})
export class SfDonutChartComponent implements AfterViewInit, OnDestroy {
  protected readonly theme = inject(ThemeService);

  @ViewChild('donutRef') private donutRef?: AccumulationChartComponent;
  @ViewChild('hostBox') private hostBox?: ElementRef<HTMLElement>;

  readonly data = input<object[]>([]);
  readonly xName = input<string>('x');
  readonly yName = input<string>('y');
  readonly options = input<SfDonutChartOptions>({});
  readonly pointClick = output<IPointEventArgs>();

  protected readonly defaultPalettes = computed(() => prismChartPalette(this.theme.isDark()));
  protected readonly sliceBorder = computed(() => ({
    width: 2.5,
    color: this.theme.isDark() ? '#0f1838' : '#ffffff',
  }));
  protected readonly dataLabel = { visible: true, position: 'Inside', font: { fontWeight: '600', size: '12px', color: '#ffffff' } };

  private resizeObserver?: ResizeObserver;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private effectTimer?: ReturnType<typeof setTimeout>;
  private isDestroyed = false;

  protected readonly resolvedLegend = computed<LegendSettingsModel>(() => ({
    visible: true,
    position: 'Bottom',
    enablePages: false,
    textWrap: 'Wrap',
    ...(this.options().legend ?? {}),
  }));

  protected readonly resolvedTooltip = computed<TooltipSettingsModel>(() => ({
    enable: true,
    ...(this.options().tooltip ?? {}),
  }));

  protected readonly motionRefreshKey = computed(
    () => `${this.data().length}:${this.options().centerLabel ?? ''}`,
  );

  protected readonly centerLabelConfig = computed(() => {
    const text = this.options().centerLabel;
    if (!text) return {};
    const sub = this.options().centerSubLabel;
    return {
      text: sub ? `${text}<br/>${sub}` : text,
      textStyle: {
        fontWeight: '700',
        size: '15px',
        color: this.theme.isDark() ? '#f8fafc' : '#142b50',
      },
    };
  });

  constructor() {
    effect(() => {
      // Refresh reactive centerLabel color whenever theme switches
      this.theme.isDark();
      this.options();
      if (this.effectTimer) clearTimeout(this.effectTimer);
      this.effectTimer = setTimeout(() => {
        if (!this.isDestroyed && this.donutRef && !this.donutRef.isDestroyed) {
          this.donutRef.refresh();
        }
      }, 40);
    });
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver !== 'undefined' && this.hostBox?.nativeElement) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.resizeTimer) clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
          if (!this.isDestroyed && this.donutRef && !this.donutRef.isDestroyed) {
            this.donutRef.refresh();
          }
        }, 150);
      });
      this.resizeObserver.observe(this.hostBox.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    if (this.effectTimer) clearTimeout(this.effectTimer);
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
  }

  exportPng(fileName?: string): void {
    this.donutRef?.exportModule?.export('PNG', fileName || this.options().exportFileName || 'donut-chart');
  }

  instance(): AccumulationChartComponent | undefined {
    return this.donutRef;
  }
}

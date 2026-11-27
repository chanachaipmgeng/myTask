import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import {
  SparklineComponent,
  SparklineModule,
  SparklineTooltipService,
} from '@syncfusion/ej2-angular-charts';
import {
  ProgressBarComponent,
  ProgressBarModule,
} from '@syncfusion/ej2-angular-progressbar';
import { ThemeService } from '../../core/theme.service';
import {
  MotionGlowTone,
  MotionInput,
  MotionWrapperComponent,
} from '../motion/motion-wrapper';
import { BadgeTone, badgeToneClass } from '../ui/badge';
import { CountUpDirective } from '../ui/count-up';

export type { BadgeTone as KpiBadgeTone } from '../ui/badge';
export type KpiAccent = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'teal' | 'violet' | 'coral';
export type KpiLayout = 'stack' | 'icon-start' | 'icon-end';
export type KpiTrendDirection = 'up' | 'down' | 'flat';
export type KpiSparklineType = 'Line' | 'Area' | 'Column' | 'WinLoss';
export type KpiSparklinePoint = { x: string | number; y: number };
export type KpiSparklineData = number[] | readonly KpiSparklinePoint[];

const ACCENT_SPARK: Record<KpiAccent, string> = {
  default: '#4c68e5',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#f43f5e',
  info: '#0ea5e9',
  teal: '#14b8a6',
  violet: '#8b5cf6',
  coral: '#f97316',
};

let nextKpiSparkUid = 1;

@Component({
  selector: 'app-kpi-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProgressBarModule, SparklineModule, CountUpDirective, MotionWrapperComponent],
  providers: [SparklineTooltipService],
  templateUrl: './kpi-stat-card.html',
  styleUrl: './kpi-stat-card.scss',
})
export class KpiStatCardComponent implements AfterViewInit, OnChanges {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly theme = inject(ThemeService);
  private readonly uid = nextKpiSparkUid++;
  private destroyed = false;
  private rafId: number | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private cachedRawSpark: KpiSparklineData | null | undefined = undefined;
  private cachedSparkPoints: KpiSparklinePoint[] = [];

  @ViewChild(SparklineComponent) private sparkline?: SparklineComponent;
  @ViewChild(ProgressBarComponent) private progressBar?: ProgressBarComponent;
  @ViewChild('sparkHost') private sparkHost?: ElementRef<HTMLElement>;
  @ViewChild('progressHost') private progressHost?: ElementRef<HTMLElement>;

  @Input() title = '';
  @Input() value: string | number = '';
  @Input() hint = '';
  @Input() badge = '';
  @Input() badgeTone: BadgeTone = 'info';
  @Input() iconCss = '';
  @Input() progress: number | null = null;
  @Input() progressColor = '';
  @Input() accent: KpiAccent = 'default';
  @Input() layout: KpiLayout = 'stack';
  @Input() trendValue = '';
  @Input() trendDirection: KpiTrendDirection = 'flat';
  @Input() trendLabel = '';
  @Input() sparklineData: KpiSparklineData | null = null;
  @Input() sparklineType: KpiSparklineType = 'Area';
  @Input() sparklineId = '';
  @Input() motion: MotionInput = 'scale-glass';

  protected sparkWidth = '100%';
  protected progressWidth = '100%';

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.refreshTimer !== null) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }
    });
  }

  protected mappedGlowTone(): MotionGlowTone {
    switch (this.accent) {
      case 'success':
      case 'teal':
        return 'good';
      case 'warning':
      case 'coral':
        return 'warning';
      case 'danger':
        return 'danger';
      case 'violet':
        return 'ai';
      case 'info':
        return 'primary';
      default:
        return 'none';
    }
  }

  ngAfterViewInit(): void {
    this.scheduleChartRefresh();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => this.scheduleChartRefresh());
    observer.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['sparklineData'] ||
      changes['sparklineType'] ||
      changes['accent'] ||
      changes['trendDirection'] ||
      changes['progress']
    ) {
      this.scheduleChartRefresh();
    }
  }

  protected badgeClass(): string {
    return badgeToneClass(this.badgeTone);
  }

  protected fillColor(): string {
    if (this.progressColor) {
      return this.progressColor;
    }
    if (this.accent !== 'default') {
      return ACCENT_SPARK[this.accent] ?? this.theme.progressFill();
    }
    return this.theme.progressFill();
  }

  protected sparkFill(): string {
    if (this.trendDirection === 'up') {
      return '#34d399';
    }
    if (this.trendDirection === 'down') {
      return '#fb7185';
    }
    return ACCENT_SPARK[this.accent] ?? ACCENT_SPARK.default;
  }

  protected trendChipClass(): string {
    const tone =
      this.trendDirection === 'up' ? 'success' : this.trendDirection === 'down' ? 'danger' : 'secondary';
    return badgeToneClass(tone);
  }

  protected sparkPoints(): KpiSparklinePoint[] {
    const raw = this.sparklineData;
    if (raw === this.cachedRawSpark) {
      return this.cachedSparkPoints;
    }
    this.cachedRawSpark = raw;
    if (!raw || (Array.isArray(raw) && raw.length === 0)) {
      this.cachedSparkPoints = [];
      return this.cachedSparkPoints;
    }
    if (typeof raw[0] === 'number') {
      this.cachedSparkPoints = (raw as number[]).map((y, i) => ({ x: i + 1, y }));
      return this.cachedSparkPoints;
    }
    this.cachedSparkPoints = [...(raw as readonly KpiSparklinePoint[])];
    return this.cachedSparkPoints;
  }

  /** เดือน/ป้ายข้อความต้องใช้ Category ไม่งั้นพิกัด X เป็น NaN */
  protected sparkValueType(): 'Numeric' | 'Category' {
    const points = this.sparkPoints();
    if (points.some((p) => typeof p.x === 'string')) {
      return 'Category';
    }
    return 'Numeric';
  }

  protected hasSparkline(): boolean {
    return this.sparkPoints().length > 0;
  }

  protected resolvedSparkId(): string {
    if (this.sparklineId) {
      return this.sparklineId;
    }
    const slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);
    return `kpi-spark-${slug || 'stat'}-${this.uid}`;
  }

  private scheduleChartRefresh(): void {
    if (this.destroyed) return;
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (this.destroyed) return;
      this.refreshSparkline();
      this.refreshProgress();
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        if (this.destroyed) return;
        this.refreshSparkline();
        this.refreshProgress();
      }, 90);
    });
  }

  private refreshSparkline(): void {
    if (this.destroyed || !this.hasSparkline()) {
      return;
    }
    const host = this.sparkHost?.nativeElement;
    const spark = this.sparkline;
    if (!host || !spark || spark.isDestroyed) {
      return;
    }
    const width = Math.max(80, Math.floor(host.clientWidth));
    this.sparkWidth = `${width}px`;
    spark.width = this.sparkWidth;
    spark.height = '44px';
    spark.refresh();
  }

  private refreshProgress(): void {
    if (this.destroyed || this.progress === null || this.progress === undefined) {
      return;
    }
    const host = this.progressHost?.nativeElement;
    const bar = this.progressBar;
    if (!host || !bar || bar.isDestroyed) {
      return;
    }
    const width = Math.max(80, Math.floor(host.clientWidth));
    this.progressWidth = `${width}px`;
    bar.width = this.progressWidth;
    bar.refresh();
  }
}

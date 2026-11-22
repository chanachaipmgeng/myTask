import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ProgressBarModule, ProgressType } from '@syncfusion/ej2-angular-progressbar';
import { ThemeService } from '../../../core/theme.service';

export type SfProgressTone = 'primary' | 'success' | 'warning' | 'danger' | 'auto';

export interface SfProgressOptions {
  type?: ProgressType;
  minimum?: number;
  maximum?: number;
  height?: string;
  width?: string;
  trackThickness?: number;
  progressThickness?: number;
  cornerRadius?: 'None' | 'Round' | 'Round4px' | 'Auto';
  showProgressValue?: boolean;
  isStriped?: boolean;
  animated?: boolean;
  tone?: SfProgressTone;
  segmentCount?: number;
  progressColor?: string;
  trackColor?: string;
}

let nextProgressId = 1;

@Component({
  selector: 'app-sf-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProgressBarModule],
  template: `
    <ejs-progressbar
      [id]="resolvedId()"
      [type]="resolvedType()"
      [value]="value()"
      [minimum]="resolvedMin()"
      [maximum]="resolvedMax()"
      [height]="resolvedHeight()"
      [width]="resolvedWidth()"
      [trackThickness]="resolvedTrackThickness()"
      [progressThickness]="resolvedProgressThickness()"
      [cornerRadius]="resolvedCornerRadius()"
      [showProgressValue]="resolvedShowLabel()"
      [isStriped]="resolvedStriped()"
      [segmentCount]="resolvedSegments()"
      [trackColor]="trackColor()"
      [progressColor]="progressColor()"
      [animation]="animationConfig()"
      [theme]="theme.sfTheme()"
    ></ejs-progressbar>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `,
})
export class SfProgressComponent {
  protected readonly theme = inject(ThemeService);
  private readonly autoId = `sf-prog-${nextProgressId++}`;

  readonly id = input<string>('');
  readonly value = input<number>(0);
  readonly minimum = input<number>(0);
  readonly maximum = input<number>(100);
  readonly type = input<ProgressType>('Linear');
  readonly height = input<string>('12');
  readonly width = input<string>('100%');
  readonly tone = input<SfProgressTone>('primary');
  readonly showProgressValue = input<boolean>(false);
  readonly isStriped = input<boolean>(false);
  readonly animated = input<boolean>(false);
  readonly options = input<SfProgressOptions>({});

  protected readonly resolvedId = computed(() => this.id() || this.autoId);
  protected readonly resolvedType = computed(() => this.options().type ?? this.type());
  protected readonly resolvedMin = computed(() => this.options().minimum ?? this.minimum());
  protected readonly resolvedMax = computed(() => this.options().maximum ?? this.maximum());
  protected readonly resolvedHeight = computed(() => this.options().height ?? this.height());
  protected readonly resolvedWidth = computed(() => this.options().width ?? this.width());
  protected readonly resolvedTrackThickness = computed(() => this.options().trackThickness ?? 8);
  protected readonly resolvedProgressThickness = computed(() => this.options().progressThickness ?? 8);
  protected readonly resolvedCornerRadius = computed(() => this.options().cornerRadius ?? 'Round');
  protected readonly resolvedShowLabel = computed(
    () => this.options().showProgressValue ?? this.showProgressValue(),
  );
  protected readonly resolvedStriped = computed(() => this.options().isStriped ?? this.isStriped());
  protected readonly resolvedSegments = computed(() => this.options().segmentCount ?? 1);

  protected readonly trackColor = computed(
    () => this.options().trackColor ?? (this.theme.isDark() ? 'rgba(148, 179, 255, 0.14)' : 'rgba(39, 70, 179, 0.12)'),
  );

  protected readonly progressColor = computed(() => {
    if (this.options().progressColor) return this.options().progressColor!;
    const tone = this.options().tone ?? this.tone();
    if (tone === 'success') return '#10b981';
    if (tone === 'warning') return '#f59e0b';
    if (tone === 'danger') return '#f43f5e';
    if (tone === 'auto') {
      const max = this.resolvedMax() || 100;
      const pct = (this.value() / max) * 100;
      if (pct >= 80) return '#10b981';
      if (pct >= 55) return '#f59e0b';
      return '#f43f5e';
    }
    return this.theme.isDark() ? '#5f7ce3' : '#2746b3';
  });

  protected readonly animationConfig = computed(() => ({
    enable: this.options().animated ?? this.animated(),
    duration: 450,
    delay: 0,
  }));
}

import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';
import { CountUpDirective } from '../count-up';
import { PersonAvatarComponent } from '../person-avatar/person-avatar';

export type HeroBandAccent = 'primary' | 'teal' | 'violet' | 'amber' | 'emerald' | 'rose' | 'cyan';

export interface HeroBandMetric {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: 'good' | 'bad' | 'neutral';
  accent?: HeroBandAccent;
}

const DEFAULT_SLOT_ACCENTS: readonly HeroBandAccent[] = ['primary', 'teal', 'violet', 'emerald', 'amber', 'cyan'];

@Component({
  selector: 'app-hero-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CountUpDirective, PersonAvatarComponent, MotionWrapperComponent],
  templateUrl: './hero-band.html',
  styleUrl: './hero-band.scss',
})
export class HeroBandComponent {
  @Input() badge = '';
  @Input() live = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() crumb = '';
  @Input() note = '';
  @Input() avatarPersonId: string | null | undefined = null;
  @Input() avatarName: string | null | undefined = null;
  @Input() metrics: readonly HeroBandMetric[] = [];
  @Input() actionsLayout: 'row' | 'stack' = 'row';
  @Input() ariaLabel = 'หัวหน้าและดัชนี';
  @Input() motion: MotionInput = 'slide-in';

  protected metricCountDelay(index: number): number {
    return 100 + index * 55;
  }

  protected metricAccent(metric: HeroBandMetric, index: number): HeroBandAccent {
    if (metric.accent) return metric.accent;
    if (metric.tone === 'bad') return 'rose';
    if (metric.tone === 'good' && index === 0) return 'emerald';
    return DEFAULT_SLOT_ACCENTS[index % DEFAULT_SLOT_ACCENTS.length]!;
  }

  protected get refreshSignature(): string {
    return `${this.title}:${this.badge}:${this.note}:${this.metrics.map((m) => m.value).join('|')}`;
  }
}

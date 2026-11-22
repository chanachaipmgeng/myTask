import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';
import { CountUpDirective } from '../count-up';
import { PersonAvatarComponent } from '../person-avatar/person-avatar';

export interface HeroBandMetric {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: 'good' | 'bad' | 'neutral';
}

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

  protected get refreshSignature(): string {
    return `${this.title}:${this.badge}:${this.note}:${this.metrics.map((m) => m.value).join('|')}`;
  }
}

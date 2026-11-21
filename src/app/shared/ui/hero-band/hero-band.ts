import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CountUpDirective } from '../count-up';

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
  imports: [CountUpDirective],
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
  @Input() metrics: readonly HeroBandMetric[] = [];
  @Input() actionsLayout: 'row' | 'stack' = 'row';
  @Input() ariaLabel = 'หัวหน้าและดัชนี';

  protected metricCountDelay(index: number): number {
    return 100 + index * 55;
  }
}

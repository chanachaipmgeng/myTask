import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

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
}

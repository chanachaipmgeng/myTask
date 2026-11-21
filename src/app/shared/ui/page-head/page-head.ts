import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { HeroBandComponent, HeroBandMetric } from '../hero-band/hero-band';

@Component({
  selector: 'app-page-head',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HeroBandComponent],
  templateUrl: './page-head.html',
  styleUrl: './page-head.scss',
})
export class PageHeadComponent {
  @Input() title = '';
  @Input() description = '';
  @Input() breadcrumb = '';
  @Input() periodBadge = '';
  @Input() badge = '';
  @Input() live = false;
  @Input() avatarPersonId: string | null | undefined = null;
  @Input() avatarName: string | null | undefined = null;
  @Input() metrics: readonly HeroBandMetric[] = [];
}

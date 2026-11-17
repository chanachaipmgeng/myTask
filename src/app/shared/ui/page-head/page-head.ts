import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { StatusBadgeComponent } from '../status-badge/status-badge';

@Component({
  selector: 'app-page-head',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatusBadgeComponent],
  templateUrl: './page-head.html',
  styleUrl: './page-head.scss',
})
export class PageHeadComponent {
  @Input() title = '';
  @Input() description = '';
  @Input() breadcrumb = '';
  @Input() periodBadge = '';
}

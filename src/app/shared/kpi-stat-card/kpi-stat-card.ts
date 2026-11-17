import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { ProgressBarModule } from '@syncfusion/ej2-angular-progressbar';
import { ThemeService } from '../../core/theme.service';
import { BadgeTone, badgeToneClass } from '../ui/badge';

export type { BadgeTone as KpiBadgeTone } from '../ui/badge';
export type KpiAccent = 'default' | 'success' | 'warning' | 'danger' | 'info';

@Component({
  selector: 'app-kpi-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProgressBarModule],
  templateUrl: './kpi-stat-card.html',
  styleUrl: './kpi-stat-card.scss',
})
export class KpiStatCardComponent {
  protected readonly theme = inject(ThemeService);

  @Input() title = '';
  @Input() value: string | number = '';
  @Input() hint = '';
  @Input() badge = '';
  @Input() badgeTone: BadgeTone = 'info';
  @Input() iconCss = '';
  @Input() progress: number | null = null;
  @Input() progressColor = '';
  @Input() accent: KpiAccent = 'default';

  protected badgeClass(): string {
    return badgeToneClass(this.badgeTone);
  }

  protected fillColor(): string {
    return this.progressColor || this.theme.progressFill();
  }
}

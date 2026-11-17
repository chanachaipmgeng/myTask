import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { ProgressBarModule } from '@syncfusion/ej2-angular-progressbar';
import { ThemeService } from '../../core/theme.service';

export type KpiBadgeTone = 'info' | 'success' | 'warning' | 'danger' | 'primary' | 'secondary';
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
  @Input() badgeTone: KpiBadgeTone = 'info';
  @Input() iconCss = '';
  @Input() progress: number | null = null;
  @Input() progressColor = '';
  @Input() accent: KpiAccent = 'default';

  protected badgeClass(): string {
    const map: Record<KpiBadgeTone, string> = {
      info: 'e-badge-info',
      success: 'e-badge-success',
      warning: 'e-badge-warning',
      danger: 'e-badge-danger',
      primary: 'e-badge-primary',
      secondary: 'e-badge-secondary',
    };
    return `e-badge e-badge-pill ${map[this.badgeTone] ?? map.info}`;
  }

  protected fillColor(): string {
    return this.progressColor || this.theme.progressFill();
  }
}

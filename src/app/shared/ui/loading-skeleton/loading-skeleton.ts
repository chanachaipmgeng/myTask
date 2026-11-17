import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { SkeletonModule } from '@syncfusion/ej2-angular-notifications';

export type LoadingSkeletonVariant = 'form' | 'table' | 'cards';

@Component({
  selector: 'app-loading-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SkeletonModule],
  templateUrl: './loading-skeleton.html',
  styleUrl: './loading-skeleton.scss',
})
export class LoadingSkeletonComponent {
  /** รูปแบบ placeholder: form = การ์ดฟอร์ม · table = แถวตาราง · cards = การ์ด KPI */
  @Input() variant: LoadingSkeletonVariant = 'form';
  /** จำนวนแถว/การ์ด (table/cards) */
  @Input() rows = 4;
  /** เอฟเฟกต์ shimmer */
  @Input() shimmerEffect: 'Wave' | 'Pulse' | 'Fade' = 'Wave';

  protected readonly rowIndexes = Array.from({ length: 8 }, (_, i) => i);

  protected visibleRows(): number[] {
    const n = Math.max(1, Math.min(this.rows, 8));
    return this.rowIndexes.slice(0, n);
  }
}

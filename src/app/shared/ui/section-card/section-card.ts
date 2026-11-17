import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { BadgeTone } from '../badge';
import { StatusBadgeComponent } from '../status-badge/status-badge';

export type SectionCardVariant = 'panel' | 'nested';

@Component({
  selector: 'app-section-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatusBadgeComponent],
  templateUrl: './section-card.html',
  styleUrl: './section-card.scss',
})
export class SectionCardComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() badge = '';
  @Input() badgeTone: BadgeTone = 'info';
  /** panel = แผงเนื้อหาหลัก · nested = การ์ดย่อยในกริด */
  @Input() variant: SectionCardVariant = 'panel';
  /** ถ้าไม่มี title/subtitle/badge/actions จะไม่เรนเดอร์หัวการ์ด */
  @Input() showHead: boolean | null = null;

  protected get hasHead(): boolean {
    if (this.showHead != null) {
      return this.showHead;
    }
    return !!(this.title || this.subtitle || this.badge);
  }
}

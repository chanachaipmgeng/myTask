import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  MotionGlowTone,
  MotionInput,
  MotionWrapperComponent,
} from '../../motion/motion-wrapper';
import { BadgeTone } from '../badge';
import { StatusBadgeComponent } from '../status-badge/status-badge';

export type SectionCardVariant = 'panel' | 'nested';

@Component({
  selector: 'app-section-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatusBadgeComponent, MotionWrapperComponent],
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
  /** Central motion wrapper configuration (variant, options, or false to disable) */
  @Input() motion: MotionInput = undefined;
  /** Reactive key that triggers a subtle Nordic shimmer pulse when updated */
  @Input() refreshKey: unknown = undefined;
  /** Semantic ambient border glow tone */
  @Input() glowTone: MotionGlowTone = 'none';
  /** Optional loading shimmer bar */
  @Input() loading = false;

  protected get hasHead(): boolean {
    if (this.showHead != null) {
      return this.showHead;
    }
    return !!(this.title || this.subtitle || this.badge);
  }

  protected get resolvedMotion(): MotionInput {
    if (this.motion !== undefined) {
      return this.motion;
    }
    return this.variant === 'nested' ? 'scale-glass' : 'fade-up';
  }
}

import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { BadgeTone, badgeToneClass, resolveBadgeTone } from '../badge';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="cssClass">{{ displayLabel }}</span>`,
  styles: [
    `
      :host {
        display: inline-flex;
        max-width: 100%;
      }
      span {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
  ],
})
export class StatusBadgeComponent {
  @Input() label = '';
  @Input() tone: BadgeTone = 'info';
  @Input() pill = true;
  /** ถ้าส่ง value + toneMap จะคำนวณ tone อัตโนมัติ */
  @Input() value: string | boolean | null = null;
  @Input() toneMap: Record<string, BadgeTone> | null = null;

  protected get resolvedTone(): BadgeTone {
    if (this.value != null || this.toneMap) {
      return resolveBadgeTone(this.value, this.toneMap, this.tone);
    }
    return this.tone;
  }

  protected get cssClass(): string {
    return badgeToneClass(this.resolvedTone, this.pill);
  }

  protected get displayLabel(): string {
    if (this.label) {
      return this.label;
    }
    if (this.value == null) {
      return '';
    }
    return String(this.value);
  }
}

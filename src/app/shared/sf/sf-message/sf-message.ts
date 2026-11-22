import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MessageModule, Severity, Variant } from '@syncfusion/ej2-angular-notifications';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';

export type SfMessageSeverity = 'Normal' | 'Info' | 'Success' | 'Warning' | 'Error';
export type SfMessageVariant = 'Text' | 'Outlined' | 'Filled';

export interface SfMessageOptions {
  severity?: SfMessageSeverity;
  variant?: SfMessageVariant;
  showIcon?: boolean;
  dismissible?: boolean;
  compact?: boolean;
  cssClass?: string;
  motion?: MotionInput;
}

@Component({
  selector: 'app-sf-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessageModule, MotionWrapperComponent],
  template: `
    <app-motion-wrapper
      [config]="options().motion"
      variant="slide-in"
      [refreshKey]="content()"
    >
      <ejs-message
        [content]="content()"
        [severity]="resolvedSeverity()"
        [variant]="resolvedVariant()"
        [showIcon]="options().showIcon ?? showIcon()"
        [showCloseIcon]="options().dismissible ?? dismissible()"
        [cssClass]="computedCssClass()"
        (closed)="closed.emit()"
      ></ejs-message>
    </app-motion-wrapper>
  `,
  styles: `
    :host {
      display: block;
    }
    :host ::ng-deep .sf-msg--compact.e-message {
      padding: 6px 12px;
      font-size: 12.5px;
    }
  `,
})
export class SfMessageComponent {
  readonly content = input<string>('');
  readonly severity = input<SfMessageSeverity>('Info');
  readonly variant = input<SfMessageVariant>('Filled');
  readonly showIcon = input<boolean>(true);
  readonly dismissible = input<boolean>(false);
  readonly compact = input<boolean>(false);
  readonly cssClass = input<string>('');
  readonly options = input<SfMessageOptions>({});

  readonly closed = output<void>();

  protected resolvedSeverity(): Severity {
    return (this.options().severity ?? this.severity()) as unknown as Severity;
  }

  protected resolvedVariant(): Variant {
    return (this.options().variant ?? this.variant()) as unknown as Variant;
  }

  protected computedCssClass(): string {
    const parts: string[] = [];
    if (this.options().compact ?? this.compact()) {
      parts.push('sf-msg--compact');
    }
    const extra = this.options().cssClass ?? this.cssClass();
    if (extra) parts.push(extra);
    return parts.join(' ');
  }
}

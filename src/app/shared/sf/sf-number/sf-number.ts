import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ChangeEventArgs, NumericTextBoxModule } from '@syncfusion/ej2-angular-inputs';

export type SfNumberPreset = 'default' | 'yearBe' | 'md' | 'int' | 'percent';

export interface SfNumberOptions {
  preset?: SfNumberPreset;
  min?: number;
  max?: number;
  step?: number;
  format?: string;
  decimals?: number;
  showSpinButton?: boolean;
  width?: string;
  placeholder?: string;
}

@Component({
  selector: 'app-sf-number',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumericTextBoxModule],
  template: `
    <ejs-numerictextbox
      [value]="value()"
      [enabled]="!disabled()"
      [min]="resolvedMin()"
      [max]="resolvedMax()"
      [step]="resolvedStep()"
      [format]="resolvedFormat()"
      [decimals]="resolvedDecimals()"
      [showSpinButton]="options().showSpinButton ?? true"
      [width]="options().width ?? width()"
      [placeholder]="options().placeholder ?? placeholder()"
      (change)="onChange($event)"
    ></ejs-numerictextbox>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `,
})
export class SfNumberComponent {
  readonly value = input<number | null>(0);
  readonly preset = input<SfNumberPreset>('default');
  readonly min = input<number | undefined>(undefined);
  readonly max = input<number | undefined>(undefined);
  readonly step = input<number | undefined>(undefined);
  readonly format = input<string | undefined>(undefined);
  readonly disabled = input<boolean>(false);
  readonly width = input<string>('100%');
  readonly placeholder = input<string>('');
  readonly options = input<SfNumberOptions>({});

  readonly valueChange = output<number>();

  private readonly activePreset = computed(() => this.options().preset ?? this.preset());

  protected readonly resolvedFormat = computed(() => {
    const explicit = this.options().format ?? this.format();
    if (explicit) return explicit;
    switch (this.activePreset()) {
      case 'yearBe':
        return '####';
      case 'md':
        return 'n2';
      case 'int':
        return 'n0';
      case 'percent':
        return 'n0';
      default:
        return 'n2';
    }
  });

  protected readonly resolvedDecimals = computed(() => {
    if (this.options().decimals != null) return this.options().decimals!;
    const p = this.activePreset();
    return p === 'yearBe' || p === 'int' || p === 'percent' ? 0 : 2;
  });

  protected readonly resolvedStep = computed(() => {
    const explicit = this.options().step ?? this.step();
    if (explicit != null) return explicit;
    return this.activePreset() === 'md' ? 0.25 : 1;
  });

  protected readonly resolvedMin = computed(() => this.options().min ?? this.min() ?? (this.activePreset() === 'yearBe' ? 2550 : 0));
  protected readonly resolvedMax = computed(() => this.options().max ?? this.max() ?? (this.activePreset() === 'yearBe' ? 2650 : 999999));

  protected onChange(event: ChangeEventArgs): void {
    const num = typeof event.value === 'number' && Number.isFinite(event.value) ? event.value : 0;
    this.valueChange.emit(num);
  }
}

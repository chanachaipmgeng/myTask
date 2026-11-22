import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ChangedEventArgs, DatePickerModule } from '@syncfusion/ej2-angular-calendars';

export interface SfDatePickerOptions {
  placeholder?: string;
  format?: string;
  min?: Date;
  max?: Date;
  showTodayButton?: boolean;
  width?: string;
  cssClass?: string;
}

@Component({
  selector: 'app-sf-datepicker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePickerModule],
  template: `
    <ejs-datepicker
      [value]="dateValue()"
      [enabled]="!disabled()"
      [placeholder]="options().placeholder ?? placeholder()"
      [format]="options().format ?? 'yyyy-MM-dd'"
      [min]="options().min ?? undefined"
      [max]="options().max ?? undefined"
      [showTodayButton]="options().showTodayButton ?? true"
      [width]="options().width ?? width()"
      [cssClass]="options().cssClass ?? cssClass()"
      (change)="onChange($event)"
    ></ejs-datepicker>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `,
})
export class SfDatePickerComponent {
  /** Accepts either ISO string (YYYY-MM-DD) or Date object */
  readonly value = input<string | Date | null | undefined>(null);
  readonly placeholder = input<string>('YYYY-MM-DD');
  readonly disabled = input<boolean>(false);
  readonly width = input<string>('100%');
  readonly cssClass = input<string>('');
  readonly options = input<SfDatePickerOptions>({});

  /** Always emits normalized ISO string YYYY-MM-DD (or '' when cleared) */
  readonly valueChange = output<string>();

  protected readonly dateValue = computed<Date | undefined>(() => {
    const raw = this.value();
    if (!raw) return undefined;
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? undefined : raw;
    const iso = String(raw).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1);
  });

  protected onChange(event: ChangedEventArgs): void {
    const d = event.value;
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
      this.valueChange.emit('');
      return;
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    this.valueChange.emit(`${y}-${m}-${day}`);
  }
}

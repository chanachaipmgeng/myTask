import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ChangeEventArgs, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';

export interface SfCheckboxOptions {
  labelPosition?: 'Before' | 'After';
  indeterminate?: boolean;
  cssClass?: string;
}

@Component({
  selector: 'app-sf-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CheckBoxModule],
  template: `
    <ejs-checkbox
      [label]="label()"
      [checked]="checked()"
      [disabled]="disabled()"
      [indeterminate]="options().indeterminate ?? false"
      [labelPosition]="options().labelPosition ?? 'After'"
      [cssClass]="options().cssClass ?? cssClass()"
      (change)="onChange($event)"
    ></ejs-checkbox>
  `,
})
export class SfCheckboxComponent {
  readonly label = input<string>('');
  readonly checked = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly cssClass = input<string>('');
  readonly options = input<SfCheckboxOptions>({});

  readonly checkedChange = output<boolean>();

  protected onChange(event: ChangeEventArgs): void {
    this.checkedChange.emit(Boolean(event.checked));
  }
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ChangeEventArgs, DropDownListModule, FieldSettingsModel } from '@syncfusion/ej2-angular-dropdowns';

export interface SfDropdownOptions {
  placeholder?: string;
  filterBarPlaceholder?: string;
  allowFiltering?: boolean;
  showClearButton?: boolean;
  enableVirtualization?: boolean;
  width?: string;
  popupHeight?: string;
  cssClass?: string;
}

@Component({
  selector: 'app-sf-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DropDownListModule],
  template: `
    <ejs-dropdownlist
      [dataSource]="items()"
      [fields]="fields()"
      [value]="value()"
      [enabled]="!disabled()"
      [placeholder]="options().placeholder ?? placeholder()"
      [allowFiltering]="options().allowFiltering ?? allowFiltering()"
      [filterBarPlaceholder]="options().filterBarPlaceholder ?? filterBarPlaceholder()"
      [showClearButton]="options().showClearButton ?? showClearButton()"
      [enableVirtualization]="options().enableVirtualization ?? false"
      [width]="options().width ?? width()"
      [popupHeight]="options().popupHeight ?? '280px'"
      [cssClass]="options().cssClass ?? cssClass()"
      (change)="onChange($event)"
    ></ejs-dropdownlist>
  `,
  styles: `
    :host {
      display: inline-block;
      min-width: 0;
    }
  `,
})
export class SfDropdownComponent {
  readonly items = input<object[] | string[]>([]);
  readonly fields = input<FieldSettingsModel>({ text: 'text', value: 'value' });
  readonly value = input<string | number | null>('');
  readonly placeholder = input<string>('เลือก...');
  readonly allowFiltering = input<boolean>(false);
  readonly filterBarPlaceholder = input<string>('ค้นหา...');
  readonly showClearButton = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly width = input<string>('100%');
  readonly cssClass = input<string>('');
  readonly options = input<SfDropdownOptions>({});

  readonly valueChange = output<string>();
  readonly rawChange = output<ChangeEventArgs>();

  protected onChange(event: ChangeEventArgs): void {
    this.rawChange.emit(event);
    this.valueChange.emit(event.value == null ? '' : String(event.value));
  }
}

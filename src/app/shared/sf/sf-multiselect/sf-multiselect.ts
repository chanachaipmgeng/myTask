import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  CheckBoxSelectionService,
  FieldSettingsModel,
  MultiSelectChangeEventArgs,
  MultiSelectModule,
  visualMode,
} from '@syncfusion/ej2-angular-dropdowns';

export interface SfMultiSelectOptions {
  placeholder?: string;
  mode?: visualMode;
  allowFiltering?: boolean;
  showSelectAll?: boolean;
  showDropDownIcon?: boolean;
  width?: string;
  cssClass?: string;
}

@Component({
  selector: 'app-sf-multiselect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MultiSelectModule],
  providers: [CheckBoxSelectionService],
  template: `
    <ejs-multiselect
      [dataSource]="items()"
      [fields]="fields()"
      [value]="value()"
      [enabled]="!disabled()"
      [placeholder]="options().placeholder ?? placeholder()"
      [mode]="options().mode ?? 'Box'"
      [allowFiltering]="options().allowFiltering ?? true"
      [showSelectAll]="options().showSelectAll ?? false"
      [showDropDownIcon]="options().showDropDownIcon ?? true"
      [width]="options().width ?? width()"
      [cssClass]="options().cssClass ?? cssClass()"
      (change)="onChange($event)"
    ></ejs-multiselect>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `,
})
export class SfMultiSelectComponent {
  readonly items = input<object[] | string[]>([]);
  readonly fields = input<FieldSettingsModel>({ text: 'text', value: 'value' });
  readonly value = input<string[]>([]);
  readonly placeholder = input<string>('เลือกได้หลายรายการ...');
  readonly disabled = input<boolean>(false);
  readonly width = input<string>('100%');
  readonly cssClass = input<string>('');
  readonly options = input<SfMultiSelectOptions>({});

  readonly valueChange = output<string[]>();

  protected onChange(event: MultiSelectChangeEventArgs): void {
    const val = Array.isArray(event.value) ? event.value.map(String) : [];
    this.valueChange.emit(val);
  }
}

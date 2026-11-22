import { ChangeDetectionStrategy, Component, OnDestroy, input, output } from '@angular/core';
import { FloatLabelType, TextAreaModule, TextBoxModule } from '@syncfusion/ej2-angular-inputs';

export interface SfTextBoxOptions {
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'url';
  multiline?: boolean;
  rows?: number;
  clearButton?: boolean;
  debounceMs?: number;
  floatLabelType?: FloatLabelType;
  readonly?: boolean;
  width?: string;
  cssClass?: string;
}

@Component({
  selector: 'app-sf-textbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TextBoxModule, TextAreaModule],
  template: `
    @if (options().multiline || multiline()) {
      <ejs-textarea
        [value]="value()"
        [placeholder]="options().placeholder ?? placeholder()"
        [rows]="options().rows ?? rows()"
        [enabled]="!disabled()"
        [readonly]="options().readonly ?? false"
        [floatLabelType]="options().floatLabelType ?? 'Never'"
        [width]="options().width ?? width()"
        [cssClass]="options().cssClass ?? cssClass()"
        (input)="onRawInput($event.value)"
        (change)="onCommit($event.value)"
      ></ejs-textarea>
    } @else {
      <ejs-textbox
        [type]="options().type ?? 'text'"
        [value]="value()"
        [placeholder]="options().placeholder ?? placeholder()"
        [showClearButton]="options().clearButton ?? clearButton()"
        [enabled]="!disabled()"
        [readonly]="options().readonly ?? false"
        [floatLabelType]="options().floatLabelType ?? 'Never'"
        [width]="options().width ?? width()"
        [cssClass]="options().cssClass ?? cssClass()"
        (input)="onRawInput($event.value)"
        (change)="onCommit($event.value)"
      ></ejs-textbox>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `,
})
export class SfTextBoxComponent implements OnDestroy {
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly multiline = input<boolean>(false);
  readonly rows = input<number>(3);
  readonly clearButton = input<boolean>(true);
  readonly disabled = input<boolean>(false);
  readonly width = input<string>('100%');
  readonly cssClass = input<string>('');
  readonly options = input<SfTextBoxOptions>({});

  readonly valueChange = output<string>();
  readonly valueInput = output<string>();

  private debounceTimer?: ReturnType<typeof setTimeout>;

  protected onRawInput(val: string | undefined): void {
    const str = val ?? '';
    const ms = this.options().debounceMs ?? 0;
    if (ms > 0) {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.valueInput.emit(str), ms);
    } else {
      this.valueInput.emit(str);
    }
  }

  protected onCommit(val: string | undefined): void {
    this.valueChange.emit(val ?? '');
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
}

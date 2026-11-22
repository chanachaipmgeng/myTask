import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ChipListModule, ClickEventArgs, Selection } from '@syncfusion/ej2-angular-buttons';

export interface SfChipListOptions {
  selection?: Selection;
  enableDelete?: boolean;
  cssClass?: string;
}

@Component({
  selector: 'app-sf-chiplist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipListModule],
  template: `
    <ejs-chiplist
      [chips]="chips()"
      [selection]="options().selection ?? 'None'"
      [enableDelete]="options().enableDelete ?? false"
      [cssClass]="options().cssClass ?? cssClass()"
      (click)="chipClick.emit($event)"
    ></ejs-chiplist>
  `,
})
export class SfChipListComponent {
  readonly chips = input<string[] | object[]>([]);
  readonly cssClass = input<string>('');
  readonly options = input<SfChipListOptions>({});

  readonly chipClick = output<ClickEventArgs>();
}

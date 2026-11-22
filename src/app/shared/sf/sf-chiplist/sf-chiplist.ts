import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ChipListModule, ClickEventArgs, Selection } from '@syncfusion/ej2-angular-buttons';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';

export interface SfChipListOptions {
  selection?: Selection;
  enableDelete?: boolean;
  cssClass?: string;
  motion?: MotionInput;
}

@Component({
  selector: 'app-sf-chiplist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipListModule, MotionWrapperComponent],
  template: `
    <app-motion-wrapper
      [config]="options().motion"
      variant="slide-in"
      [refreshKey]="chips().length"
    >
      <ejs-chiplist
        [chips]="chips()"
        [selection]="options().selection ?? 'None'"
        [enableDelete]="options().enableDelete ?? false"
        [cssClass]="options().cssClass ?? cssClass()"
        (click)="chipClick.emit($event)"
      ></ejs-chiplist>
    </app-motion-wrapper>
  `,
})
export class SfChipListComponent {
  readonly chips = input<string[] | object[]>([]);
  readonly cssClass = input<string>('');
  readonly options = input<SfChipListOptions>({});

  readonly chipClick = output<ClickEventArgs>();
}

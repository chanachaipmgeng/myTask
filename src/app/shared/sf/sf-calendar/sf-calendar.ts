import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CalendarModule, ChangedEventArgs } from '@syncfusion/ej2-angular-calendars';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';

export interface SfCalendarOptions {
  firstDayOfWeek?: number;
  showTodayButton?: boolean;
  weekNumber?: boolean;
  min?: Date;
  max?: Date;
  motion?: MotionInput;
}

@Component({
  selector: 'app-sf-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CalendarModule, MotionWrapperComponent],
  template: `
    <app-motion-wrapper [config]="options().motion" variant="scale-glass">
      <ejs-calendar
        [value]="value()"
        [firstDayOfWeek]="options().firstDayOfWeek ?? 1"
        [showTodayButton]="options().showTodayButton ?? true"
        [weekNumber]="options().weekNumber ?? false"
        [min]="options().min ?? undefined"
        [max]="options().max ?? undefined"
        (change)="dateChange.emit($event)"
      ></ejs-calendar>
    </app-motion-wrapper>
  `,
})
export class SfCalendarComponent {
  readonly value = input<Date>(new Date());
  readonly options = input<SfCalendarOptions>({});

  readonly dateChange = output<ChangedEventArgs>();
}

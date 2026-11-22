import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CalendarModule, ChangedEventArgs } from '@syncfusion/ej2-angular-calendars';

export interface SfCalendarOptions {
  firstDayOfWeek?: number;
  showTodayButton?: boolean;
  weekNumber?: boolean;
  min?: Date;
  max?: Date;
}

@Component({
  selector: 'app-sf-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CalendarModule],
  template: `
    <ejs-calendar
      [value]="value()"
      [firstDayOfWeek]="options().firstDayOfWeek ?? 1"
      [showTodayButton]="options().showTodayButton ?? true"
      [weekNumber]="options().weekNumber ?? false"
      [min]="options().min ?? undefined"
      [max]="options().max ?? undefined"
      (change)="dateChange.emit($event)"
    ></ejs-calendar>
  `,
})
export class SfCalendarComponent {
  readonly value = input<Date>(new Date());
  readonly options = input<SfCalendarOptions>({});

  readonly dateChange = output<ChangedEventArgs>();
}

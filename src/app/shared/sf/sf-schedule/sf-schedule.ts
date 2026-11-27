import { NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  TemplateRef,
  ViewChild,
  input,
  output,
} from '@angular/core';
import {
  ActionEventArgs,
  AgendaService,
  DayService,
  EventClickArgs,
  EventRenderedArgs,
  EventSettingsModel,
  GroupModel,
  NavigatingEventArgs,
  PopupOpenEventArgs,
  ScheduleComponent,
  ScheduleModule,
  TimelineMonthService,
  TimelineViewsService,
  View,
  WeekService,
  WorkWeekService,
} from '@syncfusion/ej2-angular-schedule';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';

export interface SfScheduleResource {
  field: string;
  title: string;
  name: string;
  dataSource: object[];
  textField: string;
  idField: string;
  colorField?: string;
}

export interface SfScheduleOptions {
  id?: string;
  cssClass?: string;
  height?: string;
  currentView?: View;
  views?: View[];
  firstDayOfWeek?: number;
  rowAutoHeight?: boolean;
  readonly?: boolean;
  showQuickInfo?: boolean;
  group?: GroupModel;
  motion?: MotionInput;
}

@Component({
  selector: 'app-sf-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, ScheduleModule, MotionWrapperComponent],
  providers: [
    DayService,
    WeekService,
    WorkWeekService,
    TimelineViewsService,
    TimelineMonthService,
    AgendaService,
  ],
  template: `
    <app-motion-wrapper [config]="options().motion" variant="fade-up">
    <div #hostBox class="sf-schedule-wrap">
      <ejs-schedule
        #scheduleRef
        [id]="options().id ?? 'sf-schedule'"
        [cssClass]="options().cssClass ?? ''"
        width="100%"
        [height]="options().height ?? '520px'"
        [selectedDate]="selectedDate()"
        [currentView]="options().currentView ?? 'TimelineMonth'"
        [views]="options().views ?? defaultViews"
        [firstDayOfWeek]="options().firstDayOfWeek ?? 1"
        [rowAutoHeight]="options().rowAutoHeight ?? true"
        [readonly]="options().readonly ?? true"
        [showQuickInfo]="options().showQuickInfo ?? true"
        [group]="resources().length > 0 ? (options().group ?? {}) : {}"
        [eventSettings]="eventSettings()"
        (created)="created.emit()"
        (actionBegin)="actionBegin.emit($event)"
        (actionComplete)="handleActionComplete($event)"
        (dataBound)="handleDataBound()"
        (eventClick)="eventClick.emit($event)"
        (eventRendered)="eventRendered.emit($event)"
        (navigating)="navigating.emit($event)"
        (popupOpen)="popupOpen.emit($event)"
      >
        <e-resources>
          @for (res of resources(); track res.name) {
            <e-resource
              [field]="res.field"
              [title]="res.title"
              [name]="res.name"
              [dataSource]="res.dataSource"
              [textField]="res.textField"
              [idField]="res.idField"
              [colorField]="res.colorField ?? 'Color'"
            ></e-resource>
          }
        </e-resources>
        @if (eventTemplate(); as evtTpl) {
          <ng-template #eventSettingsTemplate let-data>
            <ng-container *ngTemplateOutlet="evtTpl; context: { $implicit: data }"></ng-container>
          </ng-template>
        }
        @if (tooltipTemplate(); as tipTpl) {
          <ng-template #eventSettingsTooltipTemplate let-data>
            <ng-container *ngTemplateOutlet="tipTpl; context: { $implicit: data }"></ng-container>
          </ng-template>
        }
      </ejs-schedule>
    </div>
    </app-motion-wrapper>
  `,
  styles: `
    :host, .sf-schedule-wrap {
      display: block;
      width: 100%;
      min-width: 0;
    }
  `,
})
export class SfScheduleComponent implements AfterViewInit, OnDestroy {
  @ViewChild('scheduleRef') private scheduleRef?: ScheduleComponent;
  @ViewChild('hostBox') private hostBox?: ElementRef<HTMLElement>;

  readonly selectedDate = input<Date>(new Date());
  readonly eventSettings = input<EventSettingsModel>({});
  readonly resources = input<SfScheduleResource[]>([]);
  readonly eventTemplate = input<TemplateRef<{ $implicit: any }> | null>(null);
  readonly tooltipTemplate = input<TemplateRef<{ $implicit: any }> | null>(null);
  readonly options = input<SfScheduleOptions>({});

  readonly created = output<void>();
  readonly actionBegin = output<ActionEventArgs>();
  readonly actionComplete = output<ActionEventArgs>();
  readonly dataBound = output<void>();
  readonly eventClick = output<EventClickArgs>();
  readonly eventRendered = output<EventRenderedArgs>();
  readonly navigating = output<NavigatingEventArgs>();
  readonly popupOpen = output<PopupOpenEventArgs>();

  protected handleActionComplete(args: ActionEventArgs): void {
    try {
      this.scheduleRef?.hideSpinner();
    } catch {
      // ignore
    }
    this.actionComplete.emit(args);
  }

  protected handleDataBound(): void {
    try {
      this.scheduleRef?.hideSpinner();
    } catch {
      // ignore
    }
    this.dataBound.emit();
  }

  hideSpinner(): void {
    try {
      this.scheduleRef?.hideSpinner();
    } catch {
      // ignore
    }
  }

  protected readonly defaultViews: View[] = [
    'Day',
    'Week',
    'WorkWeek',
    'TimelineDay',
    'TimelineWeek',
    'TimelineMonth',
    'Agenda',
  ];

  private resizeObserver?: ResizeObserver;
  private resizeTimer?: ReturnType<typeof setTimeout>;

  ngAfterViewInit(): void {
    if (typeof ResizeObserver !== 'undefined' && this.hostBox?.nativeElement) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.resizeTimer) clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
          try {
            if (this.scheduleRef && !this.scheduleRef.isDestroyed) {
              this.scheduleRef.refreshLayout();
            }
          } catch {
            // ignore transient Syncfusion layout refresh during asidebar resize
          }
        }, 180);
      });
      this.resizeObserver.observe(this.hostBox.nativeElement);
    }
  }

  ngOnDestroy(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
  }

  instance(): ScheduleComponent | undefined {
    return this.scheduleRef;
  }
}

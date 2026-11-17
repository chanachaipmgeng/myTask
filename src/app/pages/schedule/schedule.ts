import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { CalendarModule } from '@syncfusion/ej2-angular-calendars';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import {
  AgendaService,
  EventClickArgs,
  EventRenderedArgs,
  NavigatingEventArgs,
  PopupOpenEventArgs,
  ScheduleComponent,
  ScheduleModule,
  TimelineMonthService,
  TimelineViewsService,
} from '@syncfusion/ej2-angular-schedule';
import { ScorecardService } from '../../core/scorecard.service';
import { ThemeService } from '../../core/theme.service';
import { Person, Ticket, Track } from '../../core/models';
import { FilterChipOption, FilterChipsComponent } from '../../shared/ui/filter-chips/filter-chips';
import { FormFieldComponent } from '../../shared/ui/form-field/form-field';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge';

type TrackFilter = Track | 'All';
type DayFilter = 'ALL' | 'SLIPPED';

interface SchedulePerson {
  Id: string;
  Text: string;
  Color: string;
}

interface ScheduleEvent {
  Id: string;
  Subject: string;
  StartTime: Date;
  EndTime: Date;
  IsAllDay: boolean;
  OwnerId: string;
  Slipped: boolean;
  Description: string;
}

interface TeamSchedule {
  people: SchedulePerson[];
  events: ScheduleEvent[];
  shown: number;
  slipped: number;
  hidden: number;
}

const COLORS = [
  '#0f6cbd',
  '#3ec6e0',
  '#54b054',
  '#f0b429',
  '#c239b3',
  '#8764b8',
  '#e3008c',
  '#00b7c3',
  '#498205',
  '#d83b01',
  '#4f6bed',
  '#038387',
  '#ca5010',
  '#881798',
  '#004e8c',
  '#8e562e',
];

@Component({
  selector: 'app-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ScheduleModule,
    CalendarModule,
    DropDownListModule,
    ButtonModule,
    MessageModule,
    RouterLink,
    PageHeadComponent,
    SectionCardComponent,
    FormFieldComponent,
    FilterChipsComponent,
    StatusBadgeComponent,
  ],
  providers: [TimelineViewsService, TimelineMonthService, AgendaService],
  templateUrl: './schedule.html',
  styleUrl: './schedule.scss',
})
export class SchedulePage {
  private readonly scorecard = inject(ScorecardService);
  protected readonly theme = inject(ThemeService);
  private readonly board = viewChild<ScheduleComponent>('board');
  private pinned = false;

  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly group = { resources: ['People'] };
  protected readonly trackOptions = [
    { text: 'ทุกสาย', value: 'All' },
    { text: 'Implement', value: 'Implement' },
    { text: 'R&D', value: 'RD' },
  ];
  protected readonly track = signal<TrackFilter>('All');
  protected readonly dayFilter = signal<DayFilter>('ALL');
  protected readonly selectedDay = signal<Date>(
    focusDate(buildTeamSchedule(this.scorecard.people(), this.scorecard.tickets(), 'All').events),
  );

  protected readonly boardModel = computed(() =>
    buildTeamSchedule(this.scorecard.people(), this.scorecard.tickets(), this.track()),
  );
  protected readonly eventSettings = computed(() => ({
    dataSource: this.boardModel().events,
    enableTooltip: true,
    allowAdding: false,
    allowEditing: false,
    allowDeleting: false,
  }));

  protected readonly selectedDayLabel = computed(() => formatThaiDay(this.selectedDay()));

  protected readonly dayAgendaAll = computed(() => {
    const day = startOfDay(this.selectedDay());
    return this.boardModel().events.filter((event) => coversDay(event, day));
  });

  protected readonly dayAgenda = computed(() => {
    const list = this.dayAgendaAll();
    return this.dayFilter() === 'SLIPPED' ? list.filter((item) => item.Slipped) : list;
  });

  protected readonly dayFilterOptions = computed<FilterChipOption[]>(() => {
    const all = this.dayAgendaAll();
    return [
      { id: 'ALL', label: 'ทั้งหมด', count: all.length },
      { id: 'SLIPPED', label: 'หลุดสัปดาห์', count: all.filter((item) => item.Slipped).length },
    ];
  });

  private readonly peopleById = computed(() => {
    const map = new Map<string, string>();
    for (const person of this.boardModel().people) {
      map.set(person.Id, person.Text);
    }
    return map;
  });

  constructor() {
    effect(() => {
      const ready = this.scorecard.apiReady();
      const board = this.board();
      const events = buildTeamSchedule(this.scorecard.people(), this.scorecard.tickets(), 'All').events;
      if (!ready || !board || this.pinned) {
        return;
      }
      this.pinned = true;
      const focused = focusDate(events);
      this.selectedDay.set(focused);
      board.selectedDate = focused;
    });
  }

  protected setTrack(event: { value?: string | null }): void {
    const value = event.value;
    if (value === 'All' || value === 'Implement' || value === 'RD') {
      this.track.set(value);
    }
  }

  protected setDayFilter(value: string): void {
    this.dayFilter.set(value === 'SLIPPED' ? 'SLIPPED' : 'ALL');
  }

  protected onCalendarChange(event: { value?: Date | null }): void {
    if (!event.value) {
      return;
    }
    this.goToDay(startOfDay(event.value));
  }

  protected onNavigating(args: NavigatingEventArgs): void {
    if (args.action === 'date' && args.currentDate) {
      this.pinned = true;
      // Schedule นำทางเองแล้ว — อัปเดตเฉพาะแผงวัน อย่าเซ็ต selectedDate ซ้ำ
      this.selectedDay.set(startOfDay(args.currentDate));
    }
  }

  protected onEventClick(args: EventClickArgs): void {
    const data = args.event as ScheduleEvent | undefined;
    const start = data?.StartTime instanceof Date ? data.StartTime : null;
    if (start) {
      this.goToDay(startOfDay(start));
    }
  }

  private goToDay(day: Date): void {
    this.pinned = true;
    if (isSameDay(day, this.selectedDay())) {
      return;
    }
    this.selectedDay.set(day);
    const board = this.board();
    if (!board) {
      return;
    }
    board.selectedDate = day;
    // Timeline Week + resources: หลังเปลี่ยนวันที่ ต้อง refreshEvents ไม่งั้นแถบงานว่าง
    setTimeout(() => {
      const live = this.board();
      if (!live) {
        return;
      }
      live.refreshEvents();
      if (live.element.querySelectorAll('.e-appointment').length === 0) {
        live.refresh();
      }
    }, 80);
  }

  protected onPopupOpen(args: PopupOpenEventArgs): void {
    // อ่านอย่างเดียว — ปิด editor/QuickInfo ของ Schedule ใช้แผงรายวันแทน
    if (args.type === 'Editor' || args.type === 'QuickInfo') {
      args.cancel = true;
    }
  }

  protected onEventRendered(args: EventRenderedArgs): void {
    if (!args.data['Slipped']) {
      return;
    }
    args.element.classList.add('ticket-slipped');
  }

  protected ownerLabel(ownerId: string): string {
    return this.peopleById().get(ownerId) ?? ownerId;
  }
}

function buildTeamSchedule(people: readonly Person[], tickets: readonly Ticket[], track: TrackFilter): TeamSchedule {
  const visiblePeople = people.filter((person) => track === 'All' || person.track === track);
  const ids = new Set(visiblePeople.map((person) => person.id));
  const scoped = tickets.filter((ticket) => track === 'All' || ticket.track === track);
  const events: ScheduleEvent[] = [];
  let hidden = 0;
  for (const ticket of scoped) {
    const span = ticketSpan(ticket);
    if (ticket.assigneeId.trim() === '' || !ids.has(ticket.assigneeId) || !span) {
      hidden += 1;
      continue;
    }
    const slipped = ticket.weekOffset > 0;
    const name = ticket.title?.trim() || ticket.module;
    const status = ticket.workflowStatus ?? (ticket.closed ? 'Done' : 'In Progress');
    const slipLabel = slipped ? `หลุด ${ticket.weekOffset} สัปดาห์` : 'ตรงสัปดาห์';
    events.push({
      Id: ticket.id,
      Subject: slipped ? `หลุด · ${ticket.id} · ${name}` : `${ticket.id} · ${name}`,
      StartTime: span.start,
      EndTime: span.endExclusive,
      IsAllDay: true,
      OwnerId: ticket.assigneeId,
      Slipped: slipped,
      Description: `${ticket.type} · ${ticket.size} · ${status} · ${slipLabel}`,
    });
  }
  return {
    people: visiblePeople.map((person) => ({
      Id: person.id,
      Text: `${person.nickname} · ${person.track === 'RD' ? 'R&D' : 'Implement'}`,
      Color: colorFor(person.id),
    })),
    events,
    shown: events.length,
    slipped: events.filter((event) => event.Slipped).length,
    hidden,
  };
}

function ticketSpan(ticket: Ticket): { start: Date; endExclusive: Date } | null {
  const started = parseDay(ticket.actualStartOn);
  const due =
    parseDay(ticket.dueOn) ?? parseDay(ticket.firstDueOn) ?? parseDay(ticket.devDeliveredOn) ?? parseDay(ticket.closedOn);
  if (started && due && due >= started) {
    return { start: started, endExclusive: addDays(due, 1) };
  }
  const day = due ?? started;
  if (!day) {
    return null;
  }
  return { start: day, endExclusive: addDays(day, 1) };
}

function parseDay(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function coversDay(event: ScheduleEvent, day: Date): boolean {
  return event.StartTime <= day && day < event.EndTime;
}

function formatThaiDay(date: Date): string {
  return date.toLocaleDateString('th-TH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function focusDate(events: readonly { StartTime: Date; EndTime: Date }[]): Date {
  if (events.length === 0) {
    return startOfDay(new Date());
  }
  const todayStart = startOfDay(new Date());
  const coversToday = events.some((event) => event.StartTime <= todayStart && todayStart < event.EndTime);
  if (coversToday) {
    return todayStart;
  }
  const counts = new Map<string, { date: Date; count: number }>();
  for (const event of events) {
    const key = `${event.StartTime.getFullYear()}-${event.StartTime.getMonth()}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, {
        date: new Date(event.StartTime.getFullYear(), event.StartTime.getMonth(), 1),
        count: 1,
      });
    }
  }
  let best = { date: events[0].StartTime, count: 0 };
  for (const item of counts.values()) {
    if (item.count > best.count) {
      best = item;
    }
  }
  return startOfDay(best.date);
}

function colorFor(id: string): string {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return COLORS[hash % COLORS.length];
}

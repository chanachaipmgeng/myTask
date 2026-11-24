import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  ActionEventArgs,
  EventClickArgs,
  EventRenderedArgs,
  NavigatingEventArgs,
  PopupOpenEventArgs,
  ToolbarActionArgs,
} from '@syncfusion/ej2-angular-schedule';
import { ItemModel } from '@syncfusion/ej2-navigations';
import { currentViewer, effectiveRole } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { ThemeService } from '../../core/theme.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { Person, Ticket, WorkflowStatus, normalizeTrack, trackDisplayLabel } from '../../core/models';
import { workflowStatusOf } from '../../core/workflow';
import {
  BadgeTone,
  FilterChipOption,
  FilterChipsComponent,
  FormFieldComponent,
  LivePulseComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  SfCalendarComponent,
  SfChartComponent,
  SfChartOptions,
  SfChartSeriesConfig,
  SfDialogComponent,
  SfDropdownComponent,
  SfMessageComponent,
  SfScheduleComponent,
  SfScheduleOptions,
  SfScheduleResource,
  StaggerDirective,
  StatusBadgeComponent,
  workflowStatusToneMap,
} from '../../shared/ui';
import { listOrgTeamOptions, type WorkspaceTrackFilter } from '../../../../shared/domain/workspace-scope';

interface LoadChartRow {
  name: string;
  onTrack: number;
  slipped: number;
  total: number;
  color: string;
}

type TrackFilter = WorkspaceTrackFilter;
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
  /** รายละเอียดใบงานแบบอ่านอย่างเดียวบนแท่ง / tooltip / แผงวัน */
  TicketId: string;
  Title: string;
  Status: WorkflowStatus;
  Progress: number;
  Size: string;
  Type: string;
  WeekLabel: string;
  IsPaused: boolean;
  IsMdDirect: boolean;
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
    ButtonModule,
    RouterLink,
    PageHeadComponent,
    PersonAvatarComponent,
    LivePulseComponent,
    StaggerDirective,
    SectionCardComponent,
    FormFieldComponent,
    FilterChipsComponent,
    StatusBadgeComponent,
    SfCalendarComponent,
    SfChartComponent,
    SfDialogComponent,
    SfDropdownComponent,
    SfMessageComponent,
    SfScheduleComponent,
  ],
  templateUrl: './schedule.html',
  styleUrl: './schedule.scss',
})
export class SchedulePage {
  private readonly route = inject(ActivatedRoute);
  private readonly scorecard = inject(ScorecardService);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly workspace = inject(WorkspaceFilter);
  protected readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly isMine = computed(
    () => this.route.snapshot.data['scope'] === 'mine' || effectiveRole() === 'member',
  );

  private readonly scopedPeople = computed(() => {
    const people = this.scorecard.people();
    if (this.isMine()) {
      const selfId = currentSession()?.person.id ?? currentViewer().id;
      return people.filter((p) => p.id === selfId);
    }
    return this.workspace.applyToPeople(people);
  });

  private readonly scopedTickets = computed(() => {
    const tickets = this.scorecard.tickets();
    if (this.isMine()) {
      const selfId = currentSession()?.person.id ?? currentViewer().id;
      return this.workspace.applyToTickets(tickets).filter((t) => t.assigneeId === selfId);
    }
    return this.workspace.applyToTickets(tickets);
  });
  private readonly board = viewChild<SfScheduleComponent>('board');
  private readonly boardHost = viewChild<ElementRef<HTMLElement>>('boardHost');
  private readonly loadChartDialog = viewChild<SfDialogComponent>('loadChartDialog');
  private readonly loadChart = viewChild<SfChartComponent>('loadChart');
  private pinned = false;
  private hostObserver: ResizeObserver | null = null;

  protected readonly scheduleOptions = computed<SfScheduleOptions>(() => ({
    id: 'team-schedule',
    cssClass: 'team-schedule',
    readonly: true,
    currentView: 'TimelineMonth',
    views: ['TimelineMonth', 'TimelineWeek', 'Agenda'],
    firstDayOfWeek: 1,
    group: { resources: ['People'] },
    rowAutoHeight: true,
    height: this.scheduleHeight(),
  }));
  protected readonly scheduleResources = computed<SfScheduleResource[]>(() => [
    {
      field: 'OwnerId',
      title: 'คน',
      name: 'People',
      dataSource: this.boardModel().people,
      textField: 'Text',
      idField: 'Id',
      colorField: 'Color',
    },
  ]);

  protected readonly chartPrimaryX = {
    valueType: 'Category' as const,
    majorGridLines: { width: 0 },
    labelIntersectAction: 'Rotate45' as const,
  };
  protected readonly chartPrimaryY = {
    title: 'จำนวนใบ',
    minimum: 0,
    interval: 1,
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };
  protected readonly loadChartSeries = computed<SfChartSeriesConfig[]>(() => {
    const rows = this.loadChartRows();
    return [
      { type: 'StackingColumn', dataSource: rows, xName: 'name', yName: 'onTrack', name: 'ตรงสัปดาห์', fill: '#54b054', columnWidth: 0.55 },
      { type: 'StackingColumn', dataSource: rows, xName: 'name', yName: 'slipped', name: 'หลุดสัปดาห์', fill: '#d83b01', columnWidth: 0.55, cornerRadius: { topLeft: 4, topRight: 4 } },
    ];
  });
  protected readonly loadChartOptions: SfChartOptions = {
    height: '360px',
    enableAnimation: false,
    exportable: true,
    exportFileName: 'schedule-load-chart',
    legend: { visible: true, position: 'Bottom' },
    tooltip: { enable: true, shared: true },
  };
  /** สายงานจาก Global Filter */
  protected readonly track = computed<TrackFilter>(() => (this.isMine() ? 'All' : this.workspace.track()));
  /** All = ทุกคนในสายที่กรอง · หรือ person.id รายคน */
  protected readonly personId = signal<string>(
    this.isMine() ? (currentSession()?.person.id ?? currentViewer().id) : (this.workspace.personId() || 'All'),
  );
  protected readonly selectedTeam = signal<string>(this.workspace.teamId() || 'All');
  private readonly syncRoleAndWorkspace = effect(() => {
    const mine = this.isMine();
    const selfId = currentSession()?.person.id ?? currentViewer().id;
    const wsPerson = this.workspace.personId();
    const wsTeam = this.workspace.teamId();
    if (mine) {
      if (this.personId() !== selfId) this.personId.set(selfId);
      if (this.selectedTeam() !== 'All') this.selectedTeam.set('All');
    } else {
      const nextPerson = wsPerson || 'All';
      if (this.personId() !== nextPerson) this.personId.set(nextPerson);
      const nextTeam = wsTeam || 'All';
      if (this.selectedTeam() !== nextTeam) this.selectedTeam.set(nextTeam);
    }
  });
  protected readonly resourcePage = signal<number>(1);
  protected readonly resourcePageSize = signal<number>(15);

  protected readonly teamOptions = computed(() => {
    const list = listOrgTeamOptions(this.scorecard.people(), this.scorecard.teams());
    return [
      { text: 'ทุกทีม', value: 'All' },
      ...list.map((t) => ({ text: t.label, value: t.id })),
    ];
  });

  protected readonly filteredPeopleCount = computed(() => {
    const track = this.track();
    const team = this.selectedTeam();
    return this.scopedPeople().filter(
      (person) =>
        (track === 'All' || normalizeTrack(person.track) === normalizeTrack(track)) &&
        (team === 'All' || person.teamId === team),
    ).length;
  });

  protected readonly totalResourcePages = computed(() =>
    Math.max(1, Math.ceil(this.filteredPeopleCount() / this.resourcePageSize())),
  );

  protected setResourcePage(page: number): void {
    if (page >= 1 && page <= this.totalResourcePages()) {
      this.resourcePage.set(page);
    }
  }

  protected setTeam(teamId: string): void {
    this.selectedTeam.set(teamId || 'All');
    this.resourcePage.set(1);
  }

  protected readonly dayFilter = signal<DayFilter>('ALL');
  protected readonly scheduleHeight = signal('640px');
  protected readonly selectedDay = signal<Date>(
    focusDate(buildTeamSchedule(this.scorecard.people(), this.scorecard.tickets(), 'All', 'All').events),
  );

  protected readonly personOptions = computed(() => {
    const track = this.track();
    const team = this.selectedTeam();
    const people = this.scopedPeople()
      .filter(
        (person) =>
          (track === 'All' || normalizeTrack(person.track) === normalizeTrack(track)) &&
          (team === 'All' || person.teamId === team),
      )
      .slice()
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'th'));
    return [
      { text: 'ทุกคน (ตามหน้า)', value: 'All' },
      ...people.map((person) => ({
        text: `${person.nickname} · ${trackDisplayLabel(person.track)}`,
        value: person.id,
      })),
    ];
  });

  protected readonly boardModel = computed(() =>
    buildTeamSchedule(
      this.scopedPeople(),
      this.scopedTickets(),
      this.track(),
      this.personId(),
      this.selectedTeam(),
      this.resourcePage(),
      this.resourcePageSize(),
    ),
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

  /** กราฟโหลดงานตามคนในเดือนที่โฟกัสบนปฏิทิน */
  protected readonly loadChartMonthLabel = computed(() => formatThaiMonth(this.selectedDay()));

  protected readonly loadChartRows = computed((): LoadChartRow[] => {
    const focus = this.selectedDay();
    const monthStart = new Date(focus.getFullYear(), focus.getMonth(), 1);
    const monthEnd = new Date(focus.getFullYear(), focus.getMonth() + 1, 1);
    const model = this.boardModel();
    return model.people.map((person) => {
      const mine = model.events.filter(
        (event) => event.OwnerId === person.Id && spansOverlap(event.StartTime, event.EndTime, monthStart, monthEnd),
      );
      const slipped = mine.filter((event) => event.Slipped).length;
      return {
        name: person.Text.split(' · ')[0] ?? person.Text,
        onTrack: mine.length - slipped,
        slipped,
        total: mine.length,
        color: person.Color,
      };
    });
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
      const board = this.board()?.instance();
      const events = buildTeamSchedule(this.scopedPeople(), this.scopedTickets(), 'All', 'All').events;
      if (!ready || !board || this.pinned) {
        return;
      }
      this.pinned = true;
      const focused = focusDate(events);
      this.selectedDay.set(focused);
      board.selectedDate = focused;
    });

    effect(() => {
      const host = this.boardHost()?.nativeElement;
      if (!host) {
        return;
      }
      this.bindBoardHostResize(host);
    });

    // เปลี่ยนสาย/คนแล้ว refresh resource rows ของ Schedule
    effect(() => {
      const model = this.boardModel();
      const board = this.board()?.instance();
      if (!board) {
        return;
      }
      void model.shown;
      queueMicrotask(() => {
        const live = this.board()?.instance();
        if (!live) {
          return;
        }
        live.refresh();
        this.syncScheduleHeight();
      });
    });

    this.destroyRef.onDestroy(() => {
      this.hostObserver?.disconnect();
      this.hostObserver = null;
    });
  }

  private readonly syncPersonWithTrack = effect(() => {
    void this.track();
    const current = this.personId();
    if (current === 'All') {
      return;
    }
    const stillVisible = this.personOptions().some((opt) => opt.value === current);
    if (!stillVisible) {
      this.personId.set('All');
    }
  });

  protected setPerson(raw: string): void {
    const value = raw?.trim() || 'All';
    this.personId.set(value);
    this.resourcePage.set(1);
  }

  protected setDayFilter(value: string): void {
    this.dayFilter.set(value === 'SLIPPED' ? 'SLIPPED' : 'ALL');
  }

  protected onScheduleCreated(): void {
    this.syncScheduleHeight();
    queueMicrotask(() => this.board()?.instance()?.refresh());
  }

  protected onActionBegin(args: ActionEventArgs): void {
    if (args.requestType !== 'toolbarItemRendering') {
      return;
    }
    const toolbarArgs = args as ToolbarActionArgs;
    const chartItem: ItemModel = {
      align: 'Right',
      overflow: 'Show',
      showTextOn: 'Both',
      prefixIcon: 'e-icons e-chart',
      text: 'กราฟโหลด',
      tooltipText: 'เปิดกราฟจำนวนใบงานตามคนในเดือนที่โฟกัส',
      cssClass: 'e-schedule-load-chart',
      click: () => this.openLoadChart(),
    };
    toolbarArgs.items = [...(toolbarArgs.items ?? []), chartItem];
  }

  protected openLoadChart(): void {
    this.loadChartDialog()?.open();
  }

  protected onLoadChartDialogOpen(): void {
    queueMicrotask(() => this.loadChart()?.instance()?.refresh());
  }

  private bindBoardHostResize(host: HTMLElement): void {
    if (typeof ResizeObserver === 'undefined') {
      this.syncScheduleHeight();
      return;
    }
    this.hostObserver?.disconnect();
    this.hostObserver = new ResizeObserver(() => this.syncScheduleHeight());
    this.hostObserver.observe(host);
    this.syncScheduleHeight();
  }

  private syncScheduleHeight(): void {
    const host = this.boardHost()?.nativeElement;
    if (!host) {
      return;
    }
    const next = Math.max(480, Math.floor(host.clientHeight));
    const value = `${next}px`;
    if (this.scheduleHeight() === value) {
      return;
    }
    this.scheduleHeight.set(value);
    queueMicrotask(() => this.board()?.instance()?.refresh());
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
    if (data?.TicketId) {
      this.openTicket(data.TicketId);
    }
  }

  protected openTicket(id: string): void {
    if (id) this.ticketDetail.open(id);
  }

  private goToDay(day: Date): void {
    this.pinned = true;
    if (isSameDay(day, this.selectedDay())) {
      return;
    }
    this.selectedDay.set(day);
    const board = this.board()?.instance();
    if (!board) {
      return;
    }
    board.selectedDate = day;
    // Timeline Week + resources: หลังเปลี่ยนวันที่ ต้อง refreshEvents ไม่งั้นแถบงานว่าง
    setTimeout(() => {
      const live = this.board()?.instance();
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
    const data = args.data as ScheduleEvent;
    if (data.Slipped) {
      args.element.classList.add('ticket-slipped');
    }
    args.element.classList.add('sched-task-appt');
    args.element.classList.add(`sched-task-appt--${statusTone(data.Status)}`);
    if (data.IsPaused) {
      args.element.classList.add('is-paused');
    }
  }

  protected ownerLabel(ownerId: string): string {
    return this.peopleById().get(ownerId) ?? ownerId;
  }

  protected statusTone(status: string): BadgeTone {
    return statusTone(status);
  }
}

function progressFromStatus(status: WorkflowStatus, closed: boolean): number {
  if (closed || status === 'Done') {
    return 100;
  }
  switch (status) {
    case 'Backlog':
      return 0;
    case 'In Progress':
      return 30;
    case 'Code Review':
      return 50;
    case 'Ready for QA':
      return 65;
    case 'In QA':
      return 80;
    case 'Reopened':
      return 25;
    default:
      return 40;
  }
}

function statusTone(status: string): BadgeTone {
  return workflowStatusToneMap[status] ?? 'info';
}

function spansOverlap(start: Date, endExclusive: Date, rangeStart: Date, rangeEndExclusive: Date): boolean {
  return start < rangeEndExclusive && endExclusive > rangeStart;
}

function formatThaiMonth(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(date);
}

function buildTeamSchedule(
  people: readonly Person[],
  tickets: readonly Ticket[],
  track: TrackFilter,
  personId: string,
  teamId = 'All',
  page = 1,
  pageSize = 15,
): TeamSchedule {
  const byTrackAndTeam = people.filter(
    (person) =>
      (track === 'All' || normalizeTrack(person.track) === normalizeTrack(track)) &&
      (teamId === 'All' || person.teamId === teamId),
  );
  let visiblePeople: readonly Person[];
  if (personId !== 'All') {
    visiblePeople = byTrackAndTeam.filter((person) => person.id === personId);
  } else {
    const start = (page - 1) * pageSize;
    visiblePeople = byTrackAndTeam.slice(start, start + pageSize);
  }
  const ids = new Set(visiblePeople.map((person) => person.id));
  const scoped = tickets.filter(
    (ticket) => track === 'All' || normalizeTrack(ticket.track) === normalizeTrack(track),
  );
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
    const status = workflowStatusOf(ticket);
    const progress = progressFromStatus(status, ticket.closed);
    const weekLabel = slipped ? `หลุด ${ticket.weekOffset} สัปดาห์` : 'ตรงสัปดาห์';
    const tags = [
      ticket.type,
      ticket.size,
      status,
      weekLabel,
      ticket.isPaused ? 'พักงาน' : '',
      ticket.isMdDirect ? 'MD-DIRECT' : '',
    ].filter(Boolean);
    events.push({
      Id: ticket.id,
      Subject: slipped ? `หลุด · ${ticket.id} · ${name}` : `${ticket.id} · ${name}`,
      StartTime: span.start,
      EndTime: span.endExclusive,
      IsAllDay: true,
      OwnerId: ticket.assigneeId,
      Slipped: slipped,
      Description: tags.join(' · '),
      TicketId: ticket.id,
      Title: name,
      Status: status,
      Progress: progress,
      Size: ticket.size,
      Type: ticket.type,
      WeekLabel: weekLabel,
      IsPaused: !!ticket.isPaused,
      IsMdDirect: !!ticket.isMdDirect,
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

import { SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { map } from 'rxjs';
import { GitBranchItem } from '../../../../shared/domain/git-branch';
import {
  WorkspaceTrackFilter,
  filterPeopleByWorkspace,
  listTeamWorkspaceCards,
  listWorkspaceTrackChipOptions,
  parseWorkspaceTrackFilter,
} from '../../../../shared/domain/workspace-scope';
import { resolvePersonTeamId } from '../../../../shared/domain/work-views';
import { effectiveRole } from '../../core/admin-settings';
import { ApiClient } from '../../core/api-client';
import { ScorecardService } from '../../core/scorecard.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { Person, trackDisplayLabel } from '../../core/models';
import {
  CARD_PAGE_SIZE,
  CardSortMode,
  FilterChipsComponent,
  KpiStatCardComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  SfDropdownComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  SfProgressComponent,
  SfTextBoxComponent,
  StaggerDirective,
  StatusBadgeComponent,
  TicketCreateDialogComponent,
  listGridOptions,
  levelToneMap,
  pageSlice,
  totalPages,
  trackToneMap,
  workflowStatusToneMap,
} from '../../shared/ui';

type PersonWsTab = 'overview' | 'work' | 'tickets' | 'schedule' | 'analytics' | 'git';
type DirectoryView = 'people' | 'teams';

const TABS: { id: PersonWsTab; text: string; icon: string }[] = [
  { id: 'overview', text: 'ภาพรวม', icon: 'e-icons e-home' },
  { id: 'work', text: 'งาน', icon: 'e-icons e-timeline-work-week' },
  { id: 'tickets', text: 'คะแนน', icon: 'e-icons e-table' },
  { id: 'schedule', text: 'ปฏิทิน', icon: 'e-icons e-timeline-today' },
  { id: 'analytics', text: 'วิเคราะห์', icon: 'e-icons e-chart' },
  { id: 'git', text: 'Git & โค้ด', icon: 'e-icons e-refresh' },
];

@Component({
  selector: 'app-person-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SlicePipe,
    ButtonModule,
    SfDropdownComponent,
    SfTextBoxComponent,
    SfProgressComponent,
    SfGridComponent,
    RouterLink,
    FilterChipsComponent,
    PageHeadComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    KpiStatCardComponent,
    StaggerDirective,
    StatusBadgeComponent,
    TicketCreateDialogComponent,
  ],
  templateUrl: './person-workspace.html',
  styleUrl: './person-workspace.scss',
})
export class PersonWorkspacePage {
  @ViewChild('createTicketDialog') createTicketDialog?: TicketCreateDialogComponent;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scorecard = inject(ScorecardService);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly api = inject(ApiClient, { optional: true });
  protected readonly workspace = inject(WorkspaceFilter);

  protected readonly personBranches = signal<GitBranchItem[]>([]);
  protected readonly loadingPersonBranches = signal(false);

  protected readonly tabs = TABS;
  protected readonly workflowStatusToneMap = workflowStatusToneMap;
  protected readonly trackToneMap = trackToneMap;
  protected readonly levelToneMap = levelToneMap;
  protected readonly query = signal('');
  protected readonly sortMode = signal<CardSortMode>('name');
  protected readonly cardPage = signal(1);
  protected readonly cardPageSize = CARD_PAGE_SIZE;
  protected readonly viewMode = signal<'grid' | 'table'>('grid');
  protected readonly directoryView = signal<DirectoryView>('people');
  protected readonly teamQuery = signal('');

  protected readonly directoryTitle = computed(() =>
    effectiveRole() === 'admin' ? 'พนักงาน & ทีม' : 'คนในทีม',
  );
  protected readonly directoryDescription = computed(() =>
    this.directoryView() === 'teams'
      ? 'เลือกการ์ดทีมเพื่อกรองรายชื่อพนักงานในทีมนั้น'
      : 'เลือกการ์ดพนักงานเพื่อเปิด Workspace งาน คะแนน ปฏิทิน และบทวิเคราะห์รายบุคคล',
  );

  protected readonly directoryColumns: SfGridColumn[] = [
    { field: 'nickname', headerText: 'พนักงาน', width: 200, cellType: 'person', personIdField: 'id' },
    { field: 'jobTitle', headerText: 'ตำแหน่ง', width: 200 },
    { field: 'trackLabel', headerText: 'สายงาน', width: 120, cellType: 'badge' },
    { field: 'level', headerText: 'ระดับ', width: 90, cellType: 'badge' },
    { field: 'index', headerText: 'ดัชนีพัฒนาการ', width: 140, format: 'N1', cellType: 'progress' },
    { field: 'openCount', headerText: 'งานเปิด', width: 95, textAlign: 'Right', cellType: 'metric' },
    { field: 'closedCount', headerText: 'ปิดแล้ว', width: 95, textAlign: 'Right', cellType: 'metric' },
    { field: 'actions', headerText: 'จัดการ', width: 150, allowSorting: false },
  ];

  protected readonly directoryGridOptions: SfGridOptions = listGridOptions({
    id: 'people-directory-grid-v1',
    height: '480',
    pageSize: 15,
    pageSizes: [15, 30, 50, 100],
    excelExport: true,
    exportFileName: 'people-directory',
  });

  protected readonly directoryTableRows = computed(() =>
    this.personCards().map((card) => ({
      id: card.person.id,
      nickname: card.person.nickname,
      fullName: card.person.fullName,
      jobTitle: card.person.jobTitle || card.person.role || '—',
      track: card.person.track,
      trackLabel: card.trackLabel,
      level: card.person.level,
      index: card.index,
      target: card.target,
      openCount: card.openCount,
      closedCount: card.closedCount,
    })),
  );
  protected readonly trackChipOptions = computed(() =>
    listWorkspaceTrackChipOptions(this.scorecard.people()).map((item) =>
      item.id === 'All' ? { id: 'All', label: 'ทุกสาย' } : item,
    ),
  );
  /** ชิปสายบน directory = Global track (มิติเดียว ไม่ซ้อน) */
  protected readonly trackFilter = computed(() => this.workspace.track());
  protected readonly sortOptions = [
    { text: 'เรียงตามชื่อ', value: 'name' },
    { text: 'เรียงตามดัชนี (สูง→ต่ำ)', value: 'index' },
  ];
  protected readonly activeTab = signal<PersonWsTab>('overview');
  protected readonly avatarErrorIds = signal<Set<string>>(new Set());
  /** เลือกทันทีตอนคลิก — ไม่รอ route เพื่อให้ไฮไลต์สลับได้ */
  private readonly pickedPersonId = signal('');

  private readonly routePersonId = toSignal(
    this.route.paramMap.pipe(map((params) => (params.get('personId') ?? '').trim())),
    { initialValue: (this.route.snapshot.paramMap.get('personId') ?? '').trim() },
  );

  private readonly routeDirectoryView = toSignal(
    this.route.queryParamMap.pipe(
      map((params): DirectoryView => (params.get('view') === 'teams' ? 'teams' : 'people')),
    ),
    {
      initialValue:
        this.route.snapshot.queryParamMap.get('view') === 'teams' ? ('teams' as const) : ('people' as const),
    },
  );

  constructor() {
    effect(() => {
      const fromRoute = this.routePersonId();
      if (fromRoute) {
        if (this.pickedPersonId() !== fromRoute) {
          this.pickedPersonId.set(fromRoute);
        }
        // ไม่เขียน Global personId จาก route — กันรั่วไป /cockpit /team /work
      } else if (this.pickedPersonId()) {
        this.pickedPersonId.set('');
      }
    });

    effect(() => {
      const view = this.routeDirectoryView();
      if (this.directoryView() !== view) {
        this.directoryView.set(view);
      }
    });

    effect(() => {
      const pid = this.selectedPersonId();
      if (pid && this.api && this.scorecard.usingApi()) {
        void this.loadPersonBranches(pid);
      } else {
        this.personBranches.set([]);
      }
    });
  }

  protected readonly teamCards = computed(() => {
    const all = listTeamWorkspaceCards(this.scorecard.people(), this.scorecard.teams());
    const allowed = this.scorecard.effectiveAllowedTeams();
    const scoped = allowed === null ? all : all.filter((card) => allowed.includes(card.id));
    const q = this.teamQuery().trim().toLowerCase();
    if (!q) {
      return scoped;
    }
    return scoped.filter(
      (card) =>
        card.name.toLowerCase().includes(q) ||
        card.trackSummary.toLowerCase().includes(q) ||
        card.leadName.toLowerCase().includes(q) ||
        card.id.toLowerCase().includes(q),
    );
  });

  protected readonly teamMemberTotal = computed(() =>
    this.teamCards().reduce((sum, card) => sum + card.memberCount, 0),
  );

  protected teamMembersPreview(teamId: string): Person[] {
    return this.scorecard
      .people()
      .filter((p) => p.active !== false && resolvePersonTeamId(p) === teamId)
      .slice(0, 6);
  }

  protected setDirectoryView(view: DirectoryView): void {
    this.directoryView.set(view);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: view === 'teams' ? 'teams' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setTeamQuery(value: string): void {
    this.teamQuery.set(value);
  }

  protected openTeamCard(teamId: string): void {
    this.workspace.setTeam(teamId);
    this.setDirectoryView('people');
  }

  protected clearTeamFilter(): void {
    this.workspace.setTeam('');
  }

  protected async loadPersonBranches(personId: string): Promise<void> {
    if (!this.api) return;
    this.loadingPersonBranches.set(true);
    try {
      const res = await this.api.getGitBranches({ personId });
      this.personBranches.set(res.branches ?? []);
    } catch {
      this.personBranches.set([]);
    } finally {
      this.loadingPersonBranches.set(false);
    }
  }

  protected onCreateTicketFromBranch(branch: GitBranchItem): void {
    this.createTicketDialog?.open(branch);
  }

  protected async onTicketCreated(): Promise<void> {
    const pid = this.selectedPersonId();
    if (pid) {
      await this.loadPersonBranches(pid);
    }
  }

  /** รายชื่อในหน้าการ์ดและตัวสลับคน: กรองตาม Global scope + คำค้นหา (ไม่ซ้อน track ซ้ำ) */
  protected readonly filteredPeople = computed(() => {
    const q = this.query().trim().toLowerCase();
    const scope = { ...this.workspace.scope(), personId: '' };
    return filterPeopleByWorkspace(this.scorecard.people(), scope, this.workspace.activeCycle())
      .slice()
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'th'))
      .filter((person) => {
        if (!q) return true;
        return (
          person.nickname.toLowerCase().includes(q) ||
          person.fullName.toLowerCase().includes(q) ||
          (person.role ?? '').toLowerCase().includes(q) ||
          (person.jobTitle ?? '').toLowerCase().includes(q)
        );
      });
  });

  protected readonly personCards = computed(() => {
    const rowsById = new Map(this.scorecard.personRows().map((r) => [r.id, r]));
    const tickets = this.scorecard.tickets();
    const cards = this.filteredPeople().map((person) => {
      const row = rowsById.get(person.id);
      const mine = tickets.filter((t) => t.assigneeId === person.id);
      const openCount = mine.filter((t) => !t.closed).length;
      const closedCount = mine.length - openCount;
      const index = row?.index ?? 0;
      const target = row?.target ?? 75;
      return {
        person,
        index,
        indexLabel: index.toFixed(1),
        target,
        onTarget: index >= target,
        openCount,
        closedCount,
        trackLabel: this.trackLabel(person),
      };
    });
    if (this.sortMode() === 'index') {
      return cards.sort((a, b) => b.index - a.index || a.person.nickname.localeCompare(b.person.nickname, 'th'));
    }
    return cards.sort((a, b) => a.person.nickname.localeCompare(b.person.nickname, 'th'));
  });

  protected readonly totalCardPages = computed(() => totalPages(this.personCards().length, this.cardPageSize));

  protected readonly pagedPersonCards = computed(() =>
    pageSlice(this.personCards(), this.cardPage(), this.cardPageSize),
  );

  protected readonly openWorkColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'รหัส', width: 120 },
    { field: 'title', headerText: 'เรื่อง', width: 220 },
    { field: 'estimateMd', headerText: 'Est MD', width: 90, textAlign: 'Right', format: 'N2' },
    { field: 'workflowStatus', headerText: 'สถานะ', width: 130 },
  ];
  protected readonly openWorkGridOptions: SfGridOptions = listGridOptions({
    height: '280px',
    pageSize: 12,
  });

  protected readonly openWorkRows = computed(() =>
    this.openTickets().map((ticket) => ({
      id: ticket.id,
      title: ticket.title || ticket.module,
      estimateMd: ticket.estimateMd,
      workflowStatus: ticket.workflowStatus || (ticket.closed ? 'Done' : 'In Progress'),
    })),
  );

  protected readonly personSwitcherOptions = computed(() =>
    this.scorecard
      .people()
      .slice()
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'th'))
      .map((p) => ({
        value: p.id,
        text: `${p.nickname} · ${p.jobTitle || p.role} (${this.trackLabel(p)})`,
      })),
  );

  protected readonly selectedPersonId = computed(
    () => this.pickedPersonId() || this.routePersonId() || '',
  );

  protected clearSelectedPerson(): void {
    this.pickedPersonId.set('');
    this.workspace.setPerson('');
    void this.workspace.navigateWithFilter(['/workspace/people']);
  }

  protected setTrackFilter(value: string): void {
    this.workspace.setTrack(parseWorkspaceTrackFilter(value));
    this.cardPage.set(1);
  }

  protected setSortMode(value: string): void {
    if (value === 'name' || value === 'index') {
      this.sortMode.set(value);
      this.cardPage.set(1);
    }
  }

  protected setCardPage(page: number): void {
    if (page >= 1 && page <= this.totalCardPages()) {
      this.cardPage.set(page);
    }
  }

  protected readonly selectedPerson = computed(() => {
    const id = this.selectedPersonId();
    if (!id) return null;
    return (
      this.filteredPeople().find((p) => p.id === id) ??
      this.scorecard.people().find((p) => p.id === id) ??
      null
    );
  });

  protected readonly personRow = computed(() => {
    const id = this.selectedPersonId();
    return this.scorecard.personRows().find((row) => row.id === id) ?? null;
  });

  protected readonly personTickets = computed(() => {
    const id = this.selectedPersonId();
    if (!id) return [];
    return this.scorecard.tickets().filter((t) => t.assigneeId === id);
  });

  protected readonly openTickets = computed(() => this.personTickets().filter((t) => !t.closed));

  protected readonly closedTickets = computed(() => this.personTickets().filter((t) => t.closed));

  protected readonly recentOpen = computed(() =>
    this.openTickets()
      .slice()
      .sort((a, b) => (b.firstDueOn || b.dueOn || '').localeCompare(a.firstDueOn || a.dueOn || ''))
      .slice(0, 8),
  );

  protected selectPerson(personId: string): void {
    if (!personId) {
      this.clearSelectedPerson();
      return;
    }
    this.pickedPersonId.set(personId);
    // route-only selection — ไม่เขียน Global personId จนกว่าจะเจาะไป /work
    void this.workspace.navigateWithFilter(['/workspace/people', personId]);
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    this.cardPage.set(1);
  }

  protected setTab(tab: PersonWsTab): void {
    this.activeTab.set(tab);
  }

  /** แท็บงาน → ตั้ง person แล้วไปรายการงานทีม */
  protected openWorkList(): void {
    const id = this.selectedPersonId();
    if (!id) {
      return;
    }
    this.workspace.setPerson(id);
    void this.workspace.navigateWithFilter(['/work/list']);
  }

  protected openTicket(id: string, event?: Event): void {
    event?.stopPropagation();
    if (id) this.ticketDetail.open(id);
  }

  protected onOpenWorkRowSelected(event: { data?: unknown }): void {
    const id = (event.data as { id?: string } | undefined)?.id;
    if (id) this.openTicket(id);
  }

  protected onAvatarError(personId: string): void {
    this.avatarErrorIds.update((set) => {
      const next = new Set(set);
      next.add(personId);
      return next;
    });
  }

  protected showAvatar(person: Person): boolean {
    return !!person.avatarUrl && !this.avatarErrorIds().has(person.id);
  }

  protected initials(person: Person): string {
    const raw = (person.nickname || person.fullName || '?').trim();
    return raw.slice(0, 2).toUpperCase();
  }

  protected trackLabel(person: Person): string {
    return trackDisplayLabel(person.track);
  }

  protected readonly quotaProgress = computed(() => {
    const person = this.selectedPerson();
    const row = this.personRow();
    if (!person || !row?.quota) {
      return 0;
    }
    return Math.min(100, (person.plannedMd / Math.max(1, row.quota)) * 100);
  });

  protected openFullProfile(): void {
    const id = this.selectedPersonId();
    if (id) {
      void this.workspace.navigateWithFilter(['/people', id]);
    }
  }
}

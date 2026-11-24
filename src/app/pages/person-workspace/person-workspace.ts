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
  listWorkspaceTrackChipOptions,
  parseWorkspaceTrackFilter,
} from '../../../../shared/domain/workspace-scope';
import { ApiClient } from '../../core/api-client';
import { ScorecardService } from '../../core/scorecard.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { Person, normalizeTrack, trackDisplayLabel } from '../../core/models';
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
  protected readonly trackFilter = signal<WorkspaceTrackFilter>('All');
  protected readonly sortMode = signal<CardSortMode>('name');
  protected readonly cardPage = signal(1);
  protected readonly cardPageSize = CARD_PAGE_SIZE;
  protected readonly trackChipOptions = computed(() =>
    listWorkspaceTrackChipOptions(this.scorecard.people()).map((item) =>
      item.id === 'All' ? { id: 'All', label: 'ทุกสาย' } : item,
    ),
  );
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

  constructor() {
    effect(() => {
      const fromRoute = this.routePersonId();
      if (fromRoute) {
        if (this.pickedPersonId() !== fromRoute) {
          this.pickedPersonId.set(fromRoute);
        }
        if (this.workspace.personId() !== fromRoute) {
          this.workspace.setPerson(fromRoute);
        }
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

  /** รายชื่อในหน้าการ์ดและตัวสลับคน: กรองตามคำค้นหาและสายงาน */
  protected readonly filteredPeople = computed(() => {
    const q = this.query().trim().toLowerCase();
    const tf = this.trackFilter();
    const scope = { ...this.workspace.scope(), personId: '' };
    return filterPeopleByWorkspace(this.scorecard.people(), scope, this.workspace.activeCycle())
      .slice()
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'th'))
      .filter((person) => {
        if (tf !== 'All' && normalizeTrack(person.track) !== normalizeTrack(tf)) return false;
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
    this.trackFilter.set(parseWorkspaceTrackFilter(value));
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
      this.pickedPersonId.set('');
      this.workspace.setPerson('');
      void this.workspace.navigateWithFilter(['/workspace/people']);
      return;
    }
    this.pickedPersonId.set(personId);
    this.workspace.setPerson(personId);
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

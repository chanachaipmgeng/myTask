import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { map } from 'rxjs';
import {
  filterPeopleByWorkspace,
  listTeamWorkspaceCards,
  listWorkspaceTrackChipOptions,
  parseWorkspaceTrackFilter,
} from '../../../../shared/domain/workspace-scope';
import { resolvePersonTeamId } from '../../../../shared/domain/work-views';
import { effectiveRole } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { Person, trackDisplayLabel } from '../../core/models';
import {
  CARD_PAGE_SIZE,
  CardSortMode,
  FilterChipsComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  SfDropdownComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  SfTextBoxComponent,
  StaggerDirective,
  StatusBadgeComponent,
  listGridOptions,
  levelToneMap,
  pageSlice,
  totalPages,
  trackToneMap,
} from '../../shared/ui';

type DirectoryView = 'people' | 'teams';

@Component({
  selector: 'app-person-directory',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    SfDropdownComponent,
    SfTextBoxComponent,
    SfGridComponent,
    FilterChipsComponent,
    PageHeadComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    StaggerDirective,
    StatusBadgeComponent,
  ],
  templateUrl: './person-directory.html',
  styleUrl: './person-workspace.scss',
})
export class PersonDirectoryPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scorecard = inject(ScorecardService);
  protected readonly workspace = inject(WorkspaceFilter);

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

  protected readonly trackChipOptions = computed(() =>
    listWorkspaceTrackChipOptions(this.scorecard.people()).map((item) =>
      item.id === 'All' ? { id: 'All', label: 'ทุกสาย' } : item,
    ),
  );
  protected readonly trackFilter = computed(() => this.workspace.track());
  protected readonly sortOptions = [
    { text: 'เรียงตามชื่อ', value: 'name' },
    { text: 'เรียงตามดัชนี (สูง→ต่ำ)', value: 'index' },
  ];

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
      const view = this.routeDirectoryView();
      if (this.directoryView() !== view) {
        this.directoryView.set(view);
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

  /** กรองตาม Global scope (team/track) — ไม่ซ้อน personId จาก route */
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
        trackLabel: trackDisplayLabel(person.track),
      };
    });
    if (this.sortMode() === 'index') {
      return cards.sort((a, b) => b.index - a.index || a.person.nickname.localeCompare(b.person.nickname, 'th'));
    }
    return cards.sort((a, b) => a.person.nickname.localeCompare(b.person.nickname, 'th'));
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

  protected readonly totalCardPages = computed(() => totalPages(this.personCards().length, this.cardPageSize));

  protected readonly pagedPersonCards = computed(() =>
    pageSlice(this.personCards(), this.cardPage(), this.cardPageSize),
  );

  protected selectPerson(personId: string): void {
    if (!personId) return;
    void this.workspace.navigateWithFilter(['/workspace/people', personId]);
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    this.cardPage.set(1);
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
}

import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { map } from 'rxjs';
import { filterPeopleByWorkspace } from '../../../../shared/domain/workspace-scope';
import { ScorecardService } from '../../core/scorecard.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { Person, trackDisplayLabel } from '../../core/models';
import {
  FilterChipsComponent,
  KpiStatCardComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  SfDropdownComponent,
  SfProgressComponent,
  SfTextBoxComponent,
  StaggerDirective,
  StatusBadgeComponent,
  workflowStatusToneMap,
} from '../../shared/ui';

type PersonWsTab = 'overview' | 'work' | 'tickets' | 'schedule' | 'analytics';

const TABS: { id: PersonWsTab; text: string; icon: string }[] = [
  { id: 'overview', text: 'ภาพรวม', icon: 'e-icons e-home' },
  { id: 'work', text: 'งาน', icon: 'e-icons e-timeline-work-week' },
  { id: 'tickets', text: 'คะแนน', icon: 'e-icons e-table' },
  { id: 'schedule', text: 'ปฏิทิน', icon: 'e-icons e-timeline-today' },
  { id: 'analytics', text: 'วิเคราะห์', icon: 'e-icons e-chart' },
];

@Component({
  selector: 'app-person-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    SfDropdownComponent,
    SfTextBoxComponent,
    SfProgressComponent,
    RouterLink,
    FilterChipsComponent,
    PageHeadComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    KpiStatCardComponent,
    StaggerDirective,
    StatusBadgeComponent,
  ],
  templateUrl: './person-workspace.html',
  styleUrl: './person-workspace.scss',
})
export class PersonWorkspacePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scorecard = inject(ScorecardService);
  protected readonly workspace = inject(WorkspaceFilter);

  protected readonly tabs = TABS;
  protected readonly workflowStatusToneMap = workflowStatusToneMap;
  protected readonly query = signal('');
  protected readonly trackFilter = signal<'All' | 'Implement' | 'RD'>('All');
  protected readonly trackChipOptions = [
    { id: 'All', label: 'ทุกสาย' },
    { id: 'Implement', label: 'Implement' },
    { id: 'RD', label: 'R&D' },
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
        if (tf !== 'All' && person.track !== tf) return false;
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
    return this.filteredPeople().map((person) => {
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
  });

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
    if (value === 'All' || value === 'Implement' || value === 'RD') {
      this.trackFilter.set(value);
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

  protected setQuery(event: { value?: string }): void {
    this.query.set(event.value ?? '');
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

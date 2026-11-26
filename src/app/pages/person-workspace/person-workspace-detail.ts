import { SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { map } from 'rxjs';
import { GitBranchItem } from '../../../../shared/domain/git-branch';
import { filterPeopleByWorkspace } from '../../../../shared/domain/workspace-scope';
import { ApiClient } from '../../core/api-client';
import { ScorecardService } from '../../core/scorecard.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { trackDisplayLabel } from '../../core/models';
import {
  KpiStatCardComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  SfDropdownComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  SfProgressComponent,
  StaggerDirective,
  StatusBadgeComponent,
  TicketCreateDialogComponent,
  listGridOptions,
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
  selector: 'app-person-workspace-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SlicePipe,
    ButtonModule,
    SfDropdownComponent,
    SfProgressComponent,
    SfGridComponent,
    RouterLink,
    PageHeadComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    KpiStatCardComponent,
    StaggerDirective,
    StatusBadgeComponent,
    TicketCreateDialogComponent,
  ],
  templateUrl: './person-workspace-detail.html',
  styleUrl: './person-workspace.scss',
})
export class PersonWorkspaceDetailPage {
  @ViewChild('createTicketDialog') createTicketDialog?: TicketCreateDialogComponent;

  private readonly route = inject(ActivatedRoute);
  private readonly scorecard = inject(ScorecardService);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly api = inject(ApiClient, { optional: true });
  protected readonly workspace = inject(WorkspaceFilter);

  protected readonly personBranches = signal<GitBranchItem[]>([]);
  protected readonly loadingPersonBranches = signal(false);
  protected readonly tabs = TABS;
  protected readonly workflowStatusToneMap = workflowStatusToneMap;
  protected readonly activeTab = signal<PersonWsTab>('overview');

  private readonly routePersonId = toSignal(
    this.route.paramMap.pipe(map((params) => (params.get('personId') ?? '').trim())),
    { initialValue: (this.route.snapshot.paramMap.get('personId') ?? '').trim() },
  );

  constructor() {
    effect(() => {
      const pid = this.selectedPersonId();
      if (pid && this.api && this.scorecard.usingApi()) {
        void this.loadPersonBranches(pid);
      } else {
        this.personBranches.set([]);
      }
    });
  }

  /** คนในขอบเขต workspace (team/track) — ใช้กับตัวสลับคน ไม่รั่วทั้งองค์กร */
  protected readonly scopedPeople = computed(() => {
    const scope = { ...this.workspace.scope(), personId: '' };
    return filterPeopleByWorkspace(this.scorecard.people(), scope, this.workspace.activeCycle())
      .slice()
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'th'));
  });

  protected readonly personSwitcherOptions = computed(() =>
    this.scopedPeople().map((p) => ({
      value: p.id,
      text: `${p.nickname} · ${p.jobTitle || p.role} (${trackDisplayLabel(p.track)})`,
    })),
  );

  protected readonly selectedPersonId = computed(() => this.routePersonId() || '');

  protected readonly selectedPerson = computed(() => {
    const id = this.selectedPersonId();
    if (!id) return null;
    return (
      this.scopedPeople().find((p) => p.id === id) ??
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

  protected readonly openWorkColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'รหัส', width: 120 },
    { field: 'title', headerText: 'เรื่อง', width: 220 },
    { field: 'estimateMd', headerText: 'Est MD', width: 90, textAlign: 'Right', format: 'N2' },
    { field: 'workflowStatus', headerText: 'สถานะ', width: 130 },
  ];
  protected readonly openWorkGridOptions: SfGridOptions = listGridOptions({
    id: 'person-open-work-grid-v2',
    height: '280px',
    pageSize: 12,
    filtering: 'Excel',
    columnChooser: true,
    excelExport: true,
    csvExport: true,
    exportFileName: 'person-open-work',
  });

  protected readonly openWorkRows = computed(() =>
    this.openTickets().map((ticket) => ({
      id: ticket.id,
      title: ticket.title || ticket.module,
      estimateMd: ticket.estimateMd,
      workflowStatus: ticket.workflowStatus || (ticket.closed ? 'Done' : 'In Progress'),
    })),
  );

  protected readonly quotaProgress = computed(() => {
    const person = this.selectedPerson();
    const row = this.personRow();
    if (!person || !row?.quota) {
      return 0;
    }
    return Math.min(100, (person.plannedMd / Math.max(1, row.quota)) * 100);
  });

  protected clearSelectedPerson(): void {
    this.workspace.setPerson('');
    void this.workspace.navigateWithFilter(['/workspace/people']);
  }

  protected selectPerson(personId: string): void {
    if (!personId) {
      this.clearSelectedPerson();
      return;
    }
    void this.workspace.navigateWithFilter(['/workspace/people', personId]);
  }

  protected setTab(tab: PersonWsTab): void {
    this.activeTab.set(tab);
  }

  protected openWorkList(): void {
    const id = this.selectedPersonId();
    if (!id) return;
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

  protected trackLabel(person: { track: string }): string {
    return trackDisplayLabel(person.track);
  }

  protected openFullProfile(): void {
    const id = this.selectedPersonId();
    if (id) {
      void this.workspace.navigateWithFilter(['/people', id]);
    }
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
}

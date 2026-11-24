import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { filter, map, startWith } from 'rxjs';
import { currentViewer, openprojectProjectCatalog } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import {
  DueBucket,
  fridayOfWeek,
  listWorkProjectOptions,
  filterWorkTickets,
} from '../../core/work-views';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { FilterChipOption, FilterChipsComponent } from '../../shared/ui/filter-chips/filter-chips';
import { FormFieldComponent } from '../../shared/ui/form-field/form-field';
import { SfTextBoxComponent } from '../../shared/sf';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { listOrgTeamOptions } from '../../../../shared/domain/workspace-scope';
import { WorkHubFilter, WorkHubScope } from './work-hub-filter';

const TEAM_TABS = [
  { text: 'สรุป', path: 'summary', icon: 'e-icons e-chart' },
  { text: 'ไทม์ไลน์', path: 'timeline', icon: 'e-icons e-timeline-work-week' },
  { text: 'แบ็กล็อก', path: 'backlog', icon: 'e-icons e-list-unordered' },
  { text: 'บอร์ด', path: 'board', icon: 'e-icons e-columns' },
  { text: 'รายการ', path: 'list', icon: 'e-icons e-table' },
  { text: 'ส่งต่อ & SLA', path: 'handoff', icon: 'e-icons e-clock' },
  { text: 'เวลาทีม', path: 'team-time', icon: 'e-icons e-day' },
] as const;

const MINE_TABS = TEAM_TABS.filter((tab) => tab.path !== 'handoff' && tab.path !== 'team-time');

@Component({
  selector: 'app-work-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    ButtonModule,
    SfTextBoxComponent,
    FilterChipsComponent,
    FormFieldComponent,
    PageHeadComponent,
  ],
  providers: [WorkHubFilter],
  templateUrl: './work-shell.html',
  styleUrl: './work-shell.scss',
})
export class WorkShell {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly scorecard = inject(ScorecardService);
  private readonly workspace = inject(WorkspaceFilter);
  protected readonly filter = inject(WorkHubFilter);

  protected readonly weekChipOptions: FilterChipOption[] = [
    { id: '-1', label: 'สัปดาห์ก่อน' },
    { id: '0', label: 'สัปดาห์นี้' },
    { id: '1', label: 'สัปดาห์หน้า' },
  ];

  protected readonly dueBucketOptions: FilterChipOption[] = [
    { id: 'all', label: 'ทุกถังวัน' },
    { id: 'overdue', label: 'เกินกำหนด' },
    { id: 'today', label: 'วันนี้' },
    { id: 'tomorrow', label: 'พรุ่งนี้' },
    { id: 'thisWeek', label: 'ในสัปดาห์' },
    { id: 'later', label: 'หลังจากนี้' },
  ];

  constructor() {
    const scope: WorkHubScope = this.route.snapshot.data['scope'] === 'mine' ? 'mine' : 'team';
    this.filter.scope.set(scope);
    this.filter.restoreFromStorage(scope);
    // Global workspace wins for team / project / track / type (cross-page URL)
    this.filter.teamId.set(this.workspace.teamId());
    this.filter.opProject.set(this.workspace.opProject());
    this.filter.opType.set(this.workspace.opType());
    this.filter.track.set(this.workspace.track());
    if (scope === 'mine') {
      const personId = currentSession()?.person.id ?? currentViewer().id;
      this.filter.assigneeId.set(personId);
    } else {
      this.filter.assigneeId.set('');
    }
    effect(() => {
      const teamId = this.workspace.teamId();
      const opProject = this.workspace.opProject();
      const opType = this.workspace.opType();
      const track = this.workspace.track();
      if (this.filter.teamId() !== teamId) this.filter.teamId.set(teamId);
      if (this.filter.opProject() !== opProject) this.filter.opProject.set(opProject);
      if (this.filter.opType() !== opType) this.filter.opType.set(opType);
      if (this.filter.track() !== track) this.filter.track.set(track);
    });
    effect(() => {
      // touch signals so persistence stays in sync
      this.filter.track();
      this.filter.query();
      this.filter.teamId();
      this.filter.opProject();
      this.filter.opType();
      this.filter.dueBucket();
      this.filter.weekOffset();
      this.filter.persist();
    });
  }

  protected readonly isMine = computed(() => this.filter.scope() === 'mine');
  protected readonly basePath = computed(() => {
    if (this.isMine()) {
      return '/me/work';
    }
    const orgMatch = this.url().match(/\/org\/teams\/([^/?#]+)\/work/);
    if (orgMatch?.[1]) {
      return `/org/teams/${orgMatch[1]}/work`;
    }
    return '/work';
  });
  protected readonly tabs = computed(() => (this.isMine() ? MINE_TABS : TEAM_TABS));
  protected readonly heading = computed(() =>
    this.isMine() ? 'ฮับงานของฉัน (ค้าง/บอร์ด)' : 'ฮับงานค้าง & แผนทีม',
  );
  protected readonly subheading = computed(() =>
    this.isMine()
      ? 'ทีม/สาย/โปรเจกต์ใช้ Global Filter ด้านบน — สลับสัปดาห์และค้นหาใบด้านล่าง'
      : 'ทีม · สาย · โปรเจกต์ จาก Global Filter · สัปดาห์/ถังวัน/ค้นหาใบในแถบนี้',
  );

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly activePath = computed(() => {
    const path = this.url().split('?')[0] ?? '';
    const base = this.basePath();
    const found = this.tabs().find(
      (tab) => path.endsWith(`${base}/${tab.path}`) || path.includes(`${base}/${tab.path}`),
    );
    return found?.path ?? 'summary';
  });

  protected readonly teamOptions = computed(() => {
    const rows = listOrgTeamOptions(this.scorecard.people(), this.scorecard.teams());
    return [{ text: 'ทุกทีม', value: '' }, ...rows.map((row) => ({ text: row.label, value: row.id }))];
  });

  /** โปรเจกต์จาก catalog (discovery) รวมกับใบที่ผ่านกรองอื่น */
  protected readonly projectOptions = computed(() => {
    const people = this.scorecard.people();
    const base = this.filter.filterOptions(people);
    const withoutProject = filterWorkTickets(this.scorecard.tickets(), { ...base, opProject: undefined });
    const fromTickets = listWorkProjectOptions(withoutProject);
    const catalog = openprojectProjectCatalog();
    const isAdmin = currentViewer().access === 'admin';
    const allowedTeams = this.scorecard.effectiveAllowedTeams();

    const catalogMap = new Map<string, (typeof catalog)[number]>();
    for (const row of catalog) {
      if (row.identifier) {
        catalogMap.set(row.identifier, row);
      }
    }

    const map = new Map<string, string>();
    for (const row of catalog) {
      if (!row.identifier) continue;
      if (row.active === false) continue;
      if (!isAdmin && allowedTeams && allowedTeams.length > 0) {
        const assigned = row.assignedTeamIds ?? [];
        if (assigned.length > 0 && !assigned.some((t) => allowedTeams.includes(t))) {
          continue;
        }
      }
      map.set(row.identifier, row.name || row.identifier);
    }
    for (const row of fromTickets) {
      if (row.id) {
        const catEntry = catalogMap.get(row.id);
        if (catEntry && catEntry.active === false) continue;
        if (!isAdmin && allowedTeams && allowedTeams.length > 0 && catEntry) {
          const assigned = catEntry.assignedTeamIds ?? [];
          if (assigned.length > 0 && !assigned.some((t) => allowedTeams.includes(t))) {
            continue;
          }
        }
        if (!map.has(row.id)) {
          map.set(row.id, row.label);
        }
      } else {
        map.set('__none__', row.label);
      }
    }
    return [
      { text: 'ทุกโปรเจกต์', value: '' },
      ...[...map.entries()]
        .map(([value, text]) => ({ text, value }))
        .sort((a, b) => a.text.localeCompare(b.text, 'th')),
    ];
  });

  protected readonly contextLine = computed(() => {
    const people = this.scorecard.people();
    const weekStart = this.filter.weekStartIso();
    const weekEnd = fridayOfWeek(weekStart);
    const teamLabel = this.teamOptions().find((row) => row.value === this.filter.teamId())?.text ?? 'ทุกทีม';
    const projectValue = this.filter.opProject();
    const projectLabel =
      this.projectOptions().find((row) => row.value === projectValue)?.text ??
      (projectValue ? projectValue : 'ทุกโปรเจกต์');
    const open = filterWorkTickets(this.scorecard.tickets(), this.filter.filterOptions(people)).filter(
      (t) => !t.closed,
    ).length;
    return `${teamLabel} · สัปดาห์ ${formatThaiDay(weekStart)}–${formatThaiDay(weekEnd)} · ${projectLabel} · ใบเปิด ${open}`;
  });

  protected setWeekChip(value: string): void {
    const n = Number(value);
    if (n === -1 || n === 0 || n === 1) {
      this.filter.weekOffset.set(n);
    }
  }

  protected setDueBucketChip(value: string): void {
    const allowed: DueBucket[] = ['all', 'overdue', 'today', 'tomorrow', 'thisWeek', 'later'];
    if (allowed.includes(value as DueBucket)) {
      this.filter.dueBucket.set(value as DueBucket);
    }
  }

  protected setQuery(event: { value?: string }): void {
    this.filter.query.set(event.value ?? '');
  }

  /** ล้างเฉพาะกรองสัปดาห์/ถังวัน/ค้นหาของ hub — ไม่แตะ Global Filter */
  protected clearContext(): void {
    this.filter.query.set('');
    this.filter.dueBucket.set('all');
    this.filter.weekOffset.set(0);
  }
}

function formatThaiDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

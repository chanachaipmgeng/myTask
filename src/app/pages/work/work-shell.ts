import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { filter, map, startWith } from 'rxjs';
import { currentViewer } from '../../core/admin-settings';
import { currentSession } from '../../core/session';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { FilterChipOption, FilterChipsComponent } from '../../shared/ui/filter-chips/filter-chips';
import { FormFieldComponent } from '../../shared/ui/form-field/form-field';
import { WorkHubFilter, WorkHubScope } from './work-hub-filter';

const TEAM_TABS = [
  { text: 'Summary', path: 'summary', icon: 'e-icons e-chart' },
  { text: 'Timeline', path: 'timeline', icon: 'e-icons e-timeline-work-week' },
  { text: 'Backlog', path: 'backlog', icon: 'e-icons e-list-unordered' },
  { text: 'Board', path: 'board', icon: 'e-icons e-kanban' },
  { text: 'List', path: 'list', icon: 'e-icons e-table' },
  { text: 'Handoff & SLA', path: 'handoff', icon: 'e-icons e-clock' },
] as const;

const MINE_TABS = TEAM_TABS.filter((tab) => tab.path !== 'handoff');

@Component({
  selector: 'app-work-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    TextBoxModule,
    FilterChipsComponent,
    FormFieldComponent,
    PageHeadComponent,
  ],
  providers: [WorkHubFilter],
  templateUrl: './work-shell.html',
})
export class WorkShell {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly filter = inject(WorkHubFilter);

  protected readonly trackChipOptions: FilterChipOption[] = [
    { id: 'All', label: 'ทั้งหมด' },
    { id: 'Implement', label: 'Implement' },
    { id: 'RD', label: 'R&D' },
  ];

  constructor() {
    const scope: WorkHubScope = this.route.snapshot.data['scope'] === 'mine' ? 'mine' : 'team';
    this.filter.scope.set(scope);
    if (scope === 'mine') {
      const personId = currentSession()?.person.id ?? currentViewer().id;
      this.filter.assigneeId.set(personId);
    } else {
      this.filter.assigneeId.set('');
    }
  }

  protected readonly isMine = computed(() => this.filter.scope() === 'mine');
  protected readonly basePath = computed(() => (this.isMine() ? '/me/work' : '/work'));
  protected readonly tabs = computed(() => (this.isMine() ? MINE_TABS : TEAM_TABS));
  protected readonly heading = computed(() =>
    this.isMine() ? 'ฮับงานของฉัน' : 'ฮับบริหารงาน (Work Hub)',
  );
  protected readonly subheading = computed(() =>
    this.isMine()
      ? 'สรุป · ไทม์ไลน์ · แบ็กล็อก · บอร์ด · รายการ — แสดงเฉพาะใบที่รับผิดชอบ'
      : 'สลับมุมมอง Summary · Timeline · Backlog · Board · List จากใบงานในระบบ — ไม่เปลี่ยนสูตรคะแนน',
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

  protected setTrackChip(value: string): void {
    if (value === 'All' || value === 'Implement' || value === 'RD') {
      this.filter.track.set(value);
    }
  }

  protected setQuery(event: { value?: string }): void {
    this.filter.query.set(event.value ?? '');
  }
}

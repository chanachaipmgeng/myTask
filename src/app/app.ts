import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, NgZone, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { AppBarModule, SidebarModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule, ToastComponent, ToastModule } from '@syncfusion/ej2-angular-notifications';
import { DialogComponent, DialogModule } from '@syncfusion/ej2-angular-popups';
import { filter, map, startWith } from 'rxjs';
import {
  actualRole,
  currentViewer,
  effectiveRole,
  setWorkspaceMode,
  teamStagingMode,
  toggleViewAsMember,
  viewAsRole,
} from './core/admin-settings';
import { AccessRole } from './core/models';
import { ApiClient } from './core/api-client';
import { ShellNotice, shellNoticeCssClass, shellNoticeTitle } from './core/shell-notice';
import { ScorecardService } from './core/scorecard.service';
import { currentSession, setSessionUser } from './core/session';
import { ThemeService } from './core/theme.service';
import { WorkspaceFilter } from './core/workspace-filter';
import { FilterChipsComponent, PersonAvatarComponent, SectionCardComponent, TicketDetailDialogComponent } from './shared/ui';
import { TicketDetailService } from './core/ticket-detail.service';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';

type NavLeaf = {
  id: string;
  text: string;
  iconCss: string;
  route: string;
  exact?: boolean;
  roles?: readonly AccessRole[];
  searchHidden?: boolean;
};
type NavGroup = {
  id: string;
  text: string;
  expanded: boolean;
  roles?: readonly AccessRole[];
  children: NavLeaf[];
};
type SidebarNavItem = {
  id: string;
  text: string;
  iconCss: string;
  route: string;
  exact?: boolean;
};
type SidebarSection = {
  id: string;
  label: string;
  items: SidebarNavItem[];
};
type ContextualTab = {
  text: string;
  route: string;
  icon: string;
  active: boolean;
};

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    SidebarModule,
    AppBarModule,
    ToastModule,
    ButtonModule,
    MessageModule,
    DialogModule,
    TextBoxModule,
    DropDownListModule,
    FilterChipsComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    TicketDetailDialogComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notice = inject(ShellNotice);
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient);
  private readonly ticketDetail = inject(TicketDetailService);
  protected readonly theme = inject(ThemeService);
  protected readonly workspaceFilter = inject(WorkspaceFilter);
  protected readonly teamStaging = teamStagingMode;
  protected readonly filterFields = { text: 'text', value: 'value' };

  @ViewChild('toast') private toast?: ToastComponent;
  @ViewChild('alertDialog') private alertDialog?: DialogComponent;
  @ViewChild('globalSearchInput') private globalSearchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('saasNav') private saasNav?: ElementRef<HTMLElement>;

  protected readonly activePill = signal({ top: 0, height: 38, visible: false });

  protected readonly globalSearch = signal('');
  protected readonly searchOpen = signal(false);
  protected readonly liveSearching = signal(false);
  protected readonly liveResults = signal<
    { id: string; title: string; status: string; from: 'local' | 'live' }[]
  >([]);

  protected readonly instantResults = computed(() => {
    const q = this.globalSearch().trim().toLowerCase();
    if (!q || q.length < 1) {
      return { tickets: [] as { id: string; title: string }[], people: [] as { id: string; name: string }[], menus: [] as NavLeaf[] };
    }
    const tickets = this.scorecard
      .tickets()
      .filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          (t.title ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8)
      .map((t) => ({ id: t.id, title: t.title ?? t.id }));
    const people = this.scorecard
      .roster()
      .filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.nickname.toLowerCase().includes(q) ||
          p.fullName.toLowerCase().includes(q),
      )
      .slice(0, 6)
      .map((p) => ({ id: p.id, name: `${p.nickname} · ${p.fullName}` }));
    const menus = leavesFor(this.role())
      .filter((l) => l.text.toLowerCase().includes(q))
      .slice(0, 6);
    return { tickets, people, menus };
  });

  protected onGlobalSearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.globalSearch.set(target?.value ?? '');
    this.searchOpen.set(true);
    this.liveResults.set([]);
  }
  protected clearGlobalSearch(event?: Event): void {
    event?.stopPropagation();
    this.globalSearch.set('');
    this.liveResults.set([]);
    this.searchOpen.set(false);
  }

  protected onWorkspaceTeam(event: { value?: string | null }): void {
    this.workspaceFilter.setTeam(event.value ?? '');
  }

  protected onWorkspaceProject(event: { value?: string | null }): void {
    this.workspaceFilter.setProject(event.value ?? '');
  }

  protected onWorkspaceTrack(value: string): void {
    this.workspaceFilter.setTrack(value);
  }

  protected onWorkspaceCycle(event: { value?: string | null }): void {
    this.workspaceFilter.setCycle(event.value ?? '');
  }

  protected onWorkspaceYear(event: { value?: string | null }): void {
    this.workspaceFilter.setYear(event.value ?? '');
  }

  protected onWorkspaceFrom(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.workspaceFilter.setFromDate(value);
  }

  protected onWorkspaceTo(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.workspaceFilter.setToDate(value);
  }

  protected applySystemCycle(): void {
    this.workspaceFilter.applySystemCycle();
  }

  protected readonly filterPopoverOpen = signal(false);
  protected toggleFilterPopover(event?: Event): void {
    event?.stopPropagation();
    this.filterPopoverOpen.update((open) => !open);
  }
  protected closeFilterPopover(): void {
    this.filterPopoverOpen.set(false);
  }

  protected readonly showGlobalFilterBar = computed(() => {
    const path = this.url().split('?')[0] || '/';
    if (
      path === '/login' ||
      path === '/admin' ||
      path.startsWith('/admin/') ||
      path.startsWith('/integrations') ||
      path === '/teams'
    ) {
      return false;
    }
    return true;
  });

  protected readonly extraFilterCount = computed(() => {
    let count = 0;
    if (this.workspaceFilter.yearCe() != null) count++;
    if (this.workspaceFilter.fromDate() || this.workspaceFilter.toDate()) count++;
    if (this.workspaceFilter.opProject()) count++;
    if (this.workspaceFilter.track()) count++;
    return count;
  });

  protected clearWorkspaceFilter(): void {
    this.workspaceFilter.clear();
  }

  protected clearWorkspacePerson(): void {
    this.workspaceFilter.setPerson('');
  }

  protected focusGlobalSearch(): void {
    this.globalSearchInput?.nativeElement.focus();
    this.searchOpen.set(true);
  }
  protected closeSearchPanel(): void {
    this.searchOpen.set(false);
  }
  protected openTicketFromSearch(id: string): void {
    this.ticketDetail.open(id);
    this.globalSearch.set('');
    this.liveResults.set([]);
    this.searchOpen.set(false);
  }
  protected goPersonFromSearch(id: string): void {
    void this.router.navigate(['/people', id]);
    this.globalSearch.set('');
    this.searchOpen.set(false);
  }
  protected goMenuFromSearch(route: string): void {
    void this.router.navigateByUrl(route);
    this.globalSearch.set('');
    this.searchOpen.set(false);
  }
  protected async searchLiveMyProject(): Promise<void> {
    const q = this.globalSearch().trim();
    if (!q) return;
    this.liveSearching.set(true);
    try {
      if (this.scorecard.usingApi()) {
        const res = await this.api.liveSearchWorkItems(q);
        const merged = [
          ...res.local.map((item) => ({
            id: item.id,
            title: item.title,
            status: item.status,
            from: 'local' as const,
          })),
          ...res.live.map((item) => ({
            id: item.id,
            title: item.title,
            status: item.status,
            from: 'live' as const,
          })),
        ];
        this.liveResults.set(merged.slice(0, 20));
      } else {
        this.liveResults.set(
          this.instantResults().tickets.map((t) => ({
            id: t.id,
            title: t.title,
            status: '',
            from: 'local' as const,
          })),
        );
      }
      this.searchOpen.set(true);
    } catch (err) {
      this.notice.warning(err instanceof Error ? err.message : String(err), 'ค้นหาสดไม่สำเร็จ');
    } finally {
      this.liveSearching.set(false);
    }
  }
  protected onGlobalSearchSubmit(): void {
    const q = this.globalSearch().trim().toLowerCase();
    if (!q) return;

    const instant = this.instantResults();
    if (instant.tickets.length === 1) {
      this.openTicketFromSearch(instant.tickets[0]!.id);
      return;
    }
    if (instant.people.length === 1 && instant.tickets.length === 0) {
      this.goPersonFromSearch(instant.people[0]!.id);
      return;
    }
    if (instant.menus.length === 1 && instant.tickets.length === 0 && instant.people.length === 0) {
      this.goMenuFromSearch(instant.menus[0]!.route);
      return;
    }

    // Prefer opening first ticket match in 360° dialog
    if (instant.tickets[0]) {
      this.openTicketFromSearch(instant.tickets[0].id);
      return;
    }

    void this.searchLiveMyProject();
  }

  private keepNavOpen = false;
  protected readonly narrow = signal(false);
  protected readonly navOpen = signal(true);
  protected readonly collapsed = signal(false);
  protected readonly alertSearch = signal('');
  protected readonly alerts = this.scorecard.alerts;
  protected readonly alertsBadge = computed(() => {
    const n = this.alerts().length;
    return n > 99 ? '99+' : String(n);
  });
  protected readonly alertsTitle = computed(() => {
    const n = this.alerts().length;
    return n > 0 ? `แจ้งเตือน ${n} รายการ` : 'แจ้งเตือน — ไม่มีรายการ';
  });
  protected readonly filteredAlerts = computed(() => {
    const query = this.alertSearch().trim().toLowerCase();
    if (!query) {
      return this.alerts();
    }
    return this.alerts().filter(
      (a) =>
        a.ticketId.toLowerCase().includes(query) ||
        a.message.toLowerCase().includes(query) ||
        a.shortLabel.toLowerCase().includes(query),
    );
  });
  protected readonly mockMode = this.scorecard.mockMode;
  protected readonly usingApi = this.scorecard.usingApi;
  protected readonly role = effectiveRole;
  protected readonly trueRole = actualRole;
  protected readonly previewingMember = computed(() => viewAsRole() === 'member');
  protected readonly activeUserLabel = computed(() => {
    const sess = currentSession();
    if (sess) {
      return `${sess.person.nickname} (${this.role()})`;
    }
    const viewer = currentViewer();
    return `${viewer.nickname} (${this.role()})`;
  });
  protected readonly activePersonId = computed(() => {
    const sess = currentSession();
    return sess?.person.id ?? currentViewer().id;
  });
  protected readonly currentPerson = computed(() => {
    const sess = currentSession();
    if (sess) {
      return sess.person;
    }
    const id = currentViewer().id;
    return this.scorecard.roster().find((p) => p.id === id) ?? null;
  });
  protected readonly userAvatarInitials = computed(() => {
    const person = this.currentPerson();
    const name = person?.nickname || person?.fullName || currentViewer().nickname || 'MD';
    return name.slice(0, 2);
  });
  protected readonly userFullName = computed(() => {
    const person = this.currentPerson();
    return person?.fullName || person?.nickname || currentViewer().nickname;
  });
  protected readonly userAvatarUrl = computed(() => this.currentPerson()?.avatarUrl ?? null);
  protected readonly avatarError = signal(false);
  protected onAvatarError(): void {
    this.avatarError.set(true);
  }
  protected readonly userTrackLevel = computed(() => {
    const person = this.currentPerson();
    if (!person) return '';
    const track = person.track === 'RD' ? 'R&D' : 'IMP';
    const roleOrLevel = person.jobTitle || `${track} · ${person.level ?? ''}`;
    return roleOrLevel;
  });
  protected readonly toastPosition = { X: 'Right', Y: 'Bottom' };
  protected readonly sidebarSections = computed<SidebarSection[]>(() => {
    const role = this.role();
    if (role === 'member') {
      return MEMBER_SIDEBAR_SECTIONS;
    }
    if (role === 'admin') {
      return [...LEAD_SIDEBAR_SECTIONS, ADMIN_SIDEBAR_SECTION];
    }
    return LEAD_SIDEBAR_SECTIONS;
  });

  protected readonly contextualTabs = computed<ContextualTab[]>(() =>
    buildContextualTabs(this.url(), this.role()),
  );

  protected readonly canPreviewMember = computed(() => this.trueRole() !== 'member');

  /** Path key so shell can restart enter cascade when the route changes. */
  protected readonly navKey = computed(() => this.url().split('?')[0] || '/');

  protected goHomeHub(): void {
    const target = this.role() === 'member' ? '/me' : '/cockpit';
    const commands = target.split('/').filter(Boolean);
    void this.workspaceFilter.navigateWithFilter(['/', ...commands]);
  }

  protected readonly selectedNodes = signal<string[]>(['my-today']);
  private readonly initialPath =
    typeof window !== 'undefined' && window.location.pathname && window.location.pathname !== '/'
      ? `${window.location.pathname}${window.location.search}`
      : this.router.url;
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.initialPath),
    ),
    { initialValue: this.initialPath },
  );
  protected readonly title = computed(() => screenTitle(this.url()));
  protected readonly isAuthScreen = computed(() => {
    const u = this.url();
    return u === '/login' || u.startsWith('/login?') || u.startsWith('/login#');
  });
  protected readonly roleThemeClass = computed(() => `role-layout--${this.role()}`);
  protected readonly roleDisplayName = computed(() => {
    const role = this.role();
    const actual = this.trueRole();
    if (role === 'member' && actual !== 'member') {
      return 'พรีวิว Member';
    }
    if (role === 'admin') return 'Admin';
    if (role === 'lead') return 'Lead';
    return 'Member';
  });
  /** true เมื่อ Lead/Admin กำลังพรีวิวในมุม Member */
  protected readonly viewingBorrowedMode = computed(() => this.role() !== this.trueRole());
  private lastAutoModeNoticeKey = '';

  constructor() {
    const isNarrowNow = typeof window !== 'undefined' ? window.innerWidth <= 800 : false;
    this.narrow.set(isNarrowNow);
    this.navOpen.set(!isNarrowNow);
    const media = window.matchMedia('(max-width: 800px)');
    media.addEventListener('change', (event) => {
      this.zone.run(() => {
        this.narrow.set(event.matches);
        this.navOpen.set(!event.matches);
        this.cdr.markForCheck();
      });
    });
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe((event) => {
      if (this.narrow() && !this.keepNavOpen) {
        this.navOpen.set(false);
      }
      this.keepNavOpen = false;
      this.filterPopoverOpen.set(false);
      // Reset scroll position to top on every navigation
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0 });
        document.documentElement.scrollTop = 0;
        const mainEl = document.querySelector<HTMLElement>('.shell-main');
        if (mainEl) mainEl.scrollTop = 0;
      }
      const path = event.urlAfterRedirects.split('?')[0] || '/';
      const actual = this.trueRole();
      // หากกำลังพรีวิวมุม Member แล้วกดเข้าหน้าทีม/แอดมิน ให้กลับสิทธิ์จริงอัตโนมัติ
      if (
        actual !== 'member' &&
        this.role() === 'member' &&
        (path.startsWith('/org/teams') ||
          path.startsWith('/workspace') ||
          path === '/team' ||
          path.startsWith('/work') ||
          path.startsWith('/queue') ||
          path.startsWith('/quality') ||
          path.startsWith('/insights') ||
          path.startsWith('/schedule') ||
          path.startsWith('/people') ||
          path.startsWith('/analytics') ||
          path.startsWith('/tickets') ||
          path.startsWith('/cockpit') ||
          path.startsWith('/mygit') ||
          path.startsWith('/ai') ||
          path === '/admin' ||
          path.startsWith('/admin/') ||
          path.startsWith('/integrations') ||
          path === '/teams')
      ) {
        this.applyAutoWorkspaceMode(
          actual,
          path,
          'ออกจากมุมมองพรีวิว Member เพื่อเปิดหน้าระดับทีม/ระบบ',
        );
      }
    });
    effect(() => {
      this.selectedNodes.set([matchNavId(this.url(), this.role())]);
    });
    window.addEventListener('keydown', (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        this.focusGlobalSearch();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || (event.target as HTMLElement | null)?.isContentEditable) {
          return;
        }
        event.preventDefault();
        this.toggleNav();
      }
    });
  }

  protected toggleNav(): void {
    if (this.narrow()) {
      this.navOpen.update((open) => !open);
    } else {
      this.collapsed.update((c) => !c);
    }
  }

  protected onAlertSearch(event: { value?: string } | Event): void {
    if ('value' in event && typeof event.value === 'string') {
      this.alertSearch.set(event.value);
    } else if ('target' in event) {
      const target = (event as Event).target as HTMLInputElement | null;
      this.alertSearch.set(target?.value ?? '');
    } else {
      this.alertSearch.set('');
    }
  }

  protected onNavClose(): void {
    if (this.narrow()) {
      this.navOpen.set(false);
    }
  }

  protected openAlerts(): void {
    this.alertDialog?.show();
  }

  protected closeAlerts(): void {
    this.alertDialog?.hide();
  }

  protected goToTicketBoard(): void {
    this.alertDialog?.hide();
    void this.router.navigate([this.role() === 'member' ? '/me/work/board' : '/work/board']);
  }

  protected goToTicketScores(): void {
    this.alertDialog?.hide();
    void this.router.navigate([this.role() === 'member' ? '/me' : '/tickets']);
  }

  protected openMyWorkspace(): void {
    void this.workspaceFilter.navigateWithFilter(['/me']);
  }

  protected openLogin(): void {
    void this.router.navigate(['/login']);
  }

  /** กลับโหมดตามสิทธิ์จริงโดยไม่เปลี่ยนบัญชีที่ล็อกอิน */
  protected restoreTrueWorkspaceMode(): void {
    const actual = this.trueRole();
    if (this.role() === actual) {
      return;
    }
    this.lastAutoModeNoticeKey = '';
    setWorkspaceMode(null);
    this.keepNavOpen = true;
    this.notice.success(
      actual === 'admin'
        ? 'กลับสู่มุมมอง Admin แล้ว'
        : actual === 'lead'
          ? 'กลับสู่มุมมอง Lead แล้ว'
          : 'กลับสู่มุมมอง Member แล้ว',
    );
    void this.workspaceFilter.navigateWithFilter([actual === 'member' ? '/me' : '/cockpit']);
  }

  private applyAutoWorkspaceMode(mode: AccessRole, path: string, message: string): void {
    const prev = this.role();
    if (prev === mode) {
      return;
    }
    setWorkspaceMode(mode === this.trueRole() ? null : mode);
    const key = `${prev}->${mode}|${path.split('/').slice(0, 3).join('/')}`;
    if (this.lastAutoModeNoticeKey === key) {
      return;
    }
    this.lastAutoModeNoticeKey = key;
    this.notice.info(message, 'สลับมุมมองเมนู');
  }

  protected togglePersonaPreview(): void {
    const next = toggleViewAsMember();
    this.keepNavOpen = true;
    if (next === 'member') {
      this.notice.info('กำลังพรีวิวในมุมพนักงาน (Member View)');
      void this.workspaceFilter.navigateWithFilter(['/me']);
    } else {
      this.notice.success(`กลับสู่มุมมอง ${next === 'admin' ? 'Admin' : 'Lead'} แล้ว`);
      void this.workspaceFilter.navigateWithFilter(['/cockpit']);
    }
  }

  protected async logout(): Promise<void> {
    try {
      if (this.usingApi()) {
        await this.api.logout();
        await this.scorecard.reloadFromApi();
      } else {
        setSessionUser(null, null);
      }
      setWorkspaceMode(null);
      this.notice.info('ออกจากระบบเรียบร้อยแล้ว');
      void this.router.navigate(['/login']);
    } catch {
      this.notice.error('ออกจากระบบไม่สำเร็จ');
    }
  }

  ngAfterViewInit(): void {
    this.notice.bind((payload) => {
      const type = payload.type ?? 'info';
      this.toast?.show({
        title: shellNoticeTitle(type, payload.title),
        content: payload.text,
        cssClass: shellNoticeCssClass(type),
      });
    });
    // Ensure initial viewport state and view hydration are synced on direct load
    queueMicrotask(() => {
      const isNarrowNow = typeof window !== 'undefined' ? window.innerWidth <= 800 : false;
      if (this.narrow() !== isNarrowNow) {
        this.narrow.set(isNarrowNow);
        this.navOpen.set(!isNarrowNow);
      }
      this.cdr.markForCheck();
    });
  }
}

/** Adaptive Sidebar Sections — Member (6 รายการตรง) / Lead (2 หมวด) / Admin (3 หมวด) */
const MEMBER_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    id: 'member-daily',
    label: 'งานประจำวัน',
    items: [
      { id: 'my-today', text: 'วันนี้ & ผลงาน', iconCss: 'e-icons e-user', route: '/me', exact: true },
      { id: 'my-cockpit', text: 'ค็อกพิทของฉัน', iconCss: 'e-icons e-grid-view', route: '/me/cockpit' },
      { id: 'my-work', text: 'งานของฉัน', iconCss: 'e-icons e-timeline-work-week', route: '/me/work' },
      { id: 'my-schedule', text: 'ปฏิทิน & ลงเวลา', iconCss: 'e-icons e-timeline-today', route: '/me/schedule' },
    ],
  },
  {
    id: 'member-score',
    label: 'คะแนน & ข้อมูล',
    items: [
      { id: 'my-tickets', text: 'คะแนน & อุทธรณ์', iconCss: 'e-icons e-table', route: '/me/tickets' },
      { id: 'my-analytics', text: 'วิเคราะห์ & MR', iconCss: 'e-icons e-chart', route: '/me/analytics' },
    ],
  },
];

const LEAD_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    id: 'sec-mine',
    label: 'ของฉัน',
    items: [
      { id: 'hub-mine', text: 'พื้นที่ของฉัน', iconCss: 'e-icons e-user', route: '/me' },
    ],
  },
  {
    id: 'sec-team',
    label: 'บริหารทีม & งาน',
    items: [
      { id: 'hub-cockpit', text: 'ค็อกพิท & ภาพรวม', iconCss: 'e-icons e-grid-view', route: '/cockpit' },
      { id: 'hub-people', text: 'ทีม & พนักงาน', iconCss: 'e-icons e-people', route: '/workspace/people' },
      { id: 'hub-work', text: 'งาน & แผนทีม', iconCss: 'e-icons e-timeline-work-week', route: '/work' },
      { id: 'hub-queue', text: 'คิวจ่ายงาน', iconCss: 'e-icons e-list-unordered', route: '/queue' },
      { id: 'hub-schedule', text: 'ปฏิทินทีม & วันลา', iconCss: 'e-icons e-timeline-today', route: '/schedule' },
      { id: 'hub-quality', text: 'คุณภาพ & คะแนน', iconCss: 'e-icons e-check-box', route: '/quality' },
      { id: 'hub-insights', text: 'วิเคราะห์ & ซิงก์', iconCss: 'e-icons e-chart', route: '/insights' },
    ],
  },
];

const ADMIN_SIDEBAR_SECTION: SidebarSection = {
  id: 'sec-admin',
  label: 'ตั้งค่าระบบ',
  items: [
    { id: 'hub-admin', text: 'หลังบ้าน & สิทธิ์', iconCss: 'e-icons e-lock', route: '/admin', exact: true },
    { id: 'hub-rubrics', text: 'ทะเบียนเกณฑ์', iconCss: 'e-icons e-bookmark', route: '/admin/rubrics' },
    { id: 'hub-snapshot', text: 'ตรวจก่อนแช่แข็ง', iconCss: 'e-icons e-check-box', route: '/admin/snapshot-check' },
    { id: 'hub-integrations', text: 'เชื่อมต่อ & Teams', iconCss: 'e-icons e-settings', route: '/integrations' },
  ],
};

function buildContextualTabs(url: string, role: AccessRole): ContextualTab[] {
  const path = (url.split('?')[0] || '/').replace(/\/$/, '') || '/';

  if (role === 'member') {
    if (path === '/me/schedule' || path === '/me/time-log') {
      return [
        { text: 'ปฏิทิน & วันลา', route: '/me/schedule', icon: 'e-icons e-timeline-today', active: path === '/me/schedule' },
        { text: 'ลงเวลางาน', route: '/me/time-log', icon: 'e-icons e-day', active: path === '/me/time-log' },
      ];
    }
    if (path === '/me/tickets' || path === '/me/time-audit' || path === '/me/disputes') {
      return [
        { text: 'คะแนนใบงาน', route: '/me/tickets', icon: 'e-icons e-table', active: path === '/me/tickets' },
        { text: 'เวลา 3 ทาง', route: '/me/time-audit', icon: 'e-icons e-clock', active: path === '/me/time-audit' },
        { text: 'อุทธรณ์คะแนน', route: '/me/disputes', icon: 'e-icons e-edit', active: path === '/me/disputes' },
      ];
    }
    if (path === '/me/analytics' || path === '/me/mygit' || path === '/me/ai') {
      return [
        { text: 'วิเคราะห์ OLS', route: '/me/analytics', icon: 'e-icons e-chart', active: path === '/me/analytics' },
        { text: 'MR / mygit', route: '/me/mygit', icon: 'e-icons e-refresh', active: path === '/me/mygit' },
        { text: 'งาน AI', route: '/me/ai', icon: 'e-icons e-chart', active: path === '/me/ai' },
      ];
    }
    return [];
  }

  // Lead / Admin paired views
  if (path === '/cockpit' || path === '/team') {
    return [
      { text: 'ค็อกพิท Bento', route: '/cockpit', icon: 'e-icons e-grid-view', active: path === '/cockpit' },
      { text: 'แดชบอร์ดทีม', route: '/team', icon: 'e-icons e-home', active: path === '/team' },
    ];
  }
  if (
    path === '/workspace/people' ||
    path.startsWith('/workspace/people/') ||
    path === '/people' ||
    path === '/org/teams'
  ) {
    return [
      {
        text: 'Workspace คน',
        route: '/workspace/people',
        icon: 'e-icons e-people',
        active: path === '/workspace/people' || path.startsWith('/workspace/people/'),
      },
      { text: 'ตารางดัชนี', route: '/people', icon: 'e-icons e-table', active: path === '/people' },
      { text: 'การ์ดทีม', route: '/org/teams', icon: 'e-icons e-grid-view', active: path === '/org/teams' },
    ];
  }
  if (role === 'admin' && (path === '/integrations' || path === '/teams')) {
    return [
      { text: 'เชื่อมต่อระบบ', route: '/integrations', icon: 'e-icons e-settings', active: path === '/integrations' },
      { text: 'แจ้งเตือน Teams', route: '/teams', icon: 'e-icons e-comment-show', active: path === '/teams' },
    ];
  }
  return [];
}

const allNavGroups: NavGroup[] = [
  // ==========================================
  // งานของฉัน — member + lead (P19 พื้นที่ทำงานรวม)
  // ==========================================
  {
    id: 'mine-home',
    text: 'ภาพรวมผลงานของฉัน',
    expanded: true,
    roles: ['member', 'lead'],
    children: [
      { id: 'me', text: 'ผลงาน & งานวันนี้', iconCss: 'e-icons e-user', route: '/me', exact: true, searchHidden: true },
      { id: 'my-cockpit', text: 'ค็อกพิทผลงานของฉัน (Bento)', iconCss: 'e-icons e-grid-view', route: '/me/cockpit' },
    ],
  },
  {
    id: 'mine-daily',
    text: 'จัดการใบงานประจำวัน',
    expanded: true,
    roles: ['member', 'lead'],
    children: [
      { id: 'my-work', text: 'ฮับงานของฉัน (ค้าง/บอร์ด)', iconCss: 'e-icons e-timeline-work-week', route: '/me/work', exact: true },
      { id: 'my-schedule', text: 'ปฏิทินงานของฉัน', iconCss: 'e-icons e-timeline-today', route: '/me/schedule' },
      { id: 'my-time-log', text: 'ลงเวลางานของฉัน', iconCss: 'e-icons e-day', route: '/me/time-log' },
    ],
  },
  {
    id: 'mine-quality',
    text: 'คะแนน & อุทธรณ์ของฉัน',
    expanded: true,
    roles: ['member', 'lead'],
    children: [
      { id: 'my-tickets', text: 'ตารางคะแนนใบงานของฉัน', iconCss: 'e-icons e-table', route: '/me/tickets' },
      { id: 'my-time-audit', text: 'เช็กเวลา 3 ทางของฉัน', iconCss: 'e-icons e-clock', route: '/me/time-audit' },
      { id: 'my-disputes', text: 'อุทธรณ์คะแนนของฉัน', iconCss: 'e-icons e-edit', route: '/me/disputes' },
    ],
  },
  {
    id: 'mine-intel',
    text: 'วิเคราะห์ & ซิงก์ของฉัน',
    expanded: true,
    roles: ['member', 'lead'],
    children: [
      { id: 'my-analytics', text: 'วิเคราะห์ผลงานเชิงลึก (OLS)', iconCss: 'e-icons e-chart', route: '/me/analytics' },
      { id: 'my-mygit', text: 'ซิงก์ MR ของฉัน', iconCss: 'e-icons e-refresh', route: '/me/mygit' },
      { id: 'my-ai', text: 'ติดตามงาน AI ของฉัน', iconCss: 'e-icons e-chart', route: '/me/ai' },
    ],
  },

  // ==========================================
  // ทีมในองค์กร — lead (พื้นที่ทำงาน)
  // ==========================================
  {
    id: 'lead-overview',
    text: 'ภาพรวมทีม & คน',
    expanded: true,
    roles: ['lead'],
    children: [
      { id: 'org-teams', text: 'ทีมในองค์กร (การ์ด)', iconCss: 'e-icons e-table', route: '/org/teams', exact: true },
      {
        id: 'workspace-people',
        text: 'Workspace คน (เลือกลูกทีม)',
        iconCss: 'e-icons e-people',
        route: '/workspace/people',
        searchHidden: true,
      },
      { id: 'team-dash', text: 'แดชบอร์ดทีม', iconCss: 'e-icons e-home', route: '/team' },
      { id: 'team-cockpit', text: 'ห้องบัญชาการ Bento (Cockpit)', iconCss: 'e-icons e-grid-view', route: '/cockpit' },
      {
        id: 'people',
        text: 'กระดานดัชนีพนักงาน',
        iconCss: 'e-icons e-people',
        route: '/people',
        exact: true,
      },
    ],
  },
  {
    id: 'lead-plan',
    text: 'บริหารแผน & จ่ายงานทีม',
    expanded: true,
    roles: ['lead'],
    children: [
      { id: 'queue', text: 'คิวงานใหม่ & จ่ายงาน', iconCss: 'e-icons e-list-unordered', route: '/queue', searchHidden: true },
      { id: 'work-hub', text: 'ฮับงานค้าง & แผนทีม', iconCss: 'e-icons e-timeline-work-week', route: '/work', exact: true, searchHidden: true },
      { id: 'schedule', text: 'ปฏิทินทีม & วันลา', iconCss: 'e-icons e-timeline-today', route: '/schedule' },
    ],
  },
  {
    id: 'lead-quality',
    text: 'ตรวจรับ & คะแนนทีม',
    expanded: true,
    roles: ['lead'],
    children: [
      { id: 'quality-audit', text: 'ตรวจรับคุณภาพ QA (DoD)', iconCss: 'e-icons e-check-box', route: '/quality/audit', searchHidden: true },
      { id: 'disputes', text: 'ศูนย์อนุมัติอุทธรณ์ทีม', iconCss: 'e-icons e-edit', route: '/quality/disputes' },
      { id: 'tickets', text: 'ตารางคะแนนใบงานทีม', iconCss: 'e-icons e-table', route: '/quality/tickets' },
      { id: 'time-audit', text: 'ตรวจสอบเวลา 3 ทางทีม', iconCss: 'e-icons e-clock', route: '/quality/time-audit' },
    ],
  },
  {
    id: 'lead-intel',
    text: 'วิเคราะห์ & ซิงก์ทีม',
    expanded: true,
    roles: ['lead'],
    children: [
      { id: 'analytics', text: 'ศูนย์วิเคราะห์ & Coaching', iconCss: 'e-icons e-chart', route: '/insights/report', searchHidden: true },
      { id: 'mygit', text: 'ซิงก์ mygit (MR) ทีม', iconCss: 'e-icons e-refresh', route: '/insights/mygit' },
      { id: 'ai', text: 'ติดตามงาน AI ทีม', iconCss: 'e-icons e-chart', route: '/insights/ai' },
      { id: 'lead-mockup', text: 'โหมดจำลองระบบ (Mockup)', iconCss: 'e-icons e-play', route: '/insights/mockup' },
    ],
  },

  // ==========================================
  // โหมดที่ 3: แอดมิน (Admin & Governance Console)
  // ==========================================
  {
    id: 'admin-overview',
    text: 'ภาพรวมองค์กร & คน',
    expanded: true,
    roles: ['admin'],
    children: [
      { id: 'admin-cockpit', text: 'ห้องบัญชาการ Bento', iconCss: 'e-icons e-grid-view', route: '/cockpit' },
      { id: 'admin-people', text: 'รายชื่อและสิทธิ์พนักงาน', iconCss: 'e-icons e-people', route: '/people', exact: true },
    ],
  },
  {
    id: 'admin-gov',
    text: 'การตั้งค่าระบบ & ธรรมาภิบาล',
    expanded: true,
    roles: ['admin'],
    children: [
      { id: 'admin-home', text: 'หลังบ้าน & สิทธิ์', iconCss: 'e-icons e-lock', route: '/admin', exact: true },
      { id: 'integrations', text: 'เชื่อมต่อระบบ', iconCss: 'e-icons e-settings', route: '/integrations' },
      {
        id: 'snapshot-check',
        text: 'ตรวจก่อนแช่แข็ง',
        iconCss: 'e-icons e-lock',
        route: '/admin/snapshot-check',
      },
      { id: 'rubrics', text: 'ทะเบียนเกณฑ์', iconCss: 'e-icons e-settings', route: '/admin/rubrics' },
      { id: 'teams', text: 'แจ้งเตือน Teams', iconCss: 'e-icons e-comment-show', route: '/teams' },
      { id: 'mockup', text: 'โหมดจำลอง', iconCss: 'e-icons e-play', route: '/mockup' },
    ],
  },
  {
    id: 'admin-intel',
    text: 'วิเคราะห์ & ตรวจสอบระดับองค์กร',
    expanded: true,
    roles: ['admin'],
    children: [
      { id: 'admin-analytics', text: 'ศูนย์วิเคราะห์ Python & AI', iconCss: 'e-icons e-chart', route: '/insights/report' },
      { id: 'admin-time-audit', text: 'ตรวจสอบเวลา 3 ทางองค์กร', iconCss: 'e-icons e-clock', route: '/quality/time-audit' },
      { id: 'admin-tickets', text: 'ตารางคะแนนรวมทั้งองค์กร', iconCss: 'e-icons e-table', route: '/quality/tickets' },
    ],
  },
];

function leavesFor(role: AccessRole): NavLeaf[] {
  const allowed: readonly AccessRole[] =
    role === 'admin' ? ['member', 'lead', 'admin'] : role === 'lead' ? ['member', 'lead'] : ['member'];
  const seen = new Set<string>();
  const out: NavLeaf[] = [];
  for (const group of allNavGroups) {
    if (group.roles && !group.roles.some((r) => allowed.includes(r))) continue;
    for (const leaf of group.children) {
      if (leaf.roles && !leaf.roles.some((r) => allowed.includes(r))) continue;
      if (seen.has(leaf.route)) continue;
      seen.add(leaf.route);
      out.push(leaf);
    }
  }
  return out;
}

function matchNavId(url: string, role: AccessRole = 'member'): string {
  const path = (url.split('?')[0] || '/').replace(/\/$/, '') || '/';

  // Member: 6 รายการส่วนตัวเรียงตรงใน Sidebar
  if (role === 'member') {
    if (path === '/me') return 'my-today';
    if (path === '/me/cockpit' || path.startsWith('/me/cockpit/')) return 'my-cockpit';
    if (path === '/me/work' || path.startsWith('/me/work/')) return 'my-work';
    if (path === '/me/schedule' || path === '/me/time-log') return 'my-schedule';
    if (path === '/me/tickets' || path === '/me/time-audit' || path === '/me/disputes') return 'my-tickets';
    if (path === '/me/analytics' || path === '/me/mygit' || path === '/me/ai') return 'my-analytics';
    return 'my-today';
  }

  // Lead & Admin: Sidebar รวมตามสิทธิ์จริง (3 หมวด)
  if (path === '/me' || path.startsWith('/me/')) return 'hub-mine';
  if (path === '/cockpit' || path.startsWith('/cockpit/') || path === '/team') return 'hub-cockpit';
  if (
    path.startsWith('/workspace/people') ||
    path === '/people' ||
    path.startsWith('/people/') ||
    path.startsWith('/org/teams')
  ) {
    return 'hub-people';
  }
  if (path === '/work' || path.startsWith('/work/')) return 'hub-work';
  if (path === '/queue' || path.startsWith('/queue/')) return 'hub-queue';
  if (path === '/schedule' || path.startsWith('/schedule/')) return 'hub-schedule';
  if (path === '/quality' || path.startsWith('/quality/') || path === '/tickets') return 'hub-quality';
  if (path === '/insights' || path.startsWith('/insights/') || path.startsWith('/analytics') || path === '/mockup') {
    return 'hub-insights';
  }
  if (path === '/admin') return 'hub-admin';
  if (path.startsWith('/admin/rubrics')) return 'hub-rubrics';
  if (path.startsWith('/admin/snapshot-check')) return 'hub-snapshot';
  if (path.startsWith('/integrations') || path === '/teams') return 'hub-integrations';
  return 'hub-cockpit';
}

function screenTitle(url: string): string {
  if (url.startsWith('/workspace/people')) return 'ทีม · Workspace คน';
  if (url.startsWith('/quality')) return 'คุณภาพ & คะแนน';
  if (url.startsWith('/insights')) return 'วิเคราะห์ & ซิงก์';
  if (url.startsWith('/org/teams/') && url.includes('/people')) return 'ทีม · คน';
  if (url.startsWith('/org/teams/') && url.includes('/work')) return 'ทีม · งาน';
  if (url.startsWith('/org/teams/') && url.includes('/tickets')) return 'ทีม · คะแนน';
  if (url.startsWith('/org/teams/') && url.includes('/cockpit')) return 'ทีม · ค็อกพิท';
  if (url.startsWith('/org/teams')) return 'ทีมในองค์กร';
  if (url.startsWith('/me/cockpit')) return 'ค็อกพิทของฉัน';
  if (url.startsWith('/cockpit')) return 'ค็อกพิท Bento';
  if (url.startsWith('/admin/rubrics')) return 'ทะเบียนเกณฑ์';
  if (url.startsWith('/work/team-time')) return 'เวลาทีมรายวัน';
  if (url.startsWith('/me/time-log')) return 'ลงเวลางาน';
  if (url.startsWith('/work/handoff')) return 'ส่งต่อ & SLA';
  if (url.startsWith('/work/board')) return 'บอร์ดงานทีม';
  if (url.startsWith('/work/timeline')) return 'ไทม์ไลน์ทีม';
  if (url.startsWith('/quality/audit')) return 'ตรวจรับ QA / DoD';
  if (url.startsWith('/me/work/board')) return 'บอร์ดของฉัน';
  if (url.startsWith('/me/work/timeline')) return 'ไทม์ไลน์ของฉัน';
  if (url.startsWith('/me/analytics')) return 'วิเคราะห์ OLS';
  if (url.startsWith('/me/tickets')) return 'คะแนนของฉัน';
  if (url.startsWith('/me/schedule')) return 'ปฏิทินของฉัน';
  if (url.startsWith('/me/time-audit')) return 'เวลา 3 ทาง';
  if (url.startsWith('/me/mygit')) return 'ซิงก์ MR';
  if (url.startsWith('/me/ai')) return 'งาน AI & Spike';
  if (url.startsWith('/me/disputes')) return 'อุทธรณ์คะแนน';
  if (url.startsWith('/analytics/time-audit')) return 'เวลา 3 ทาง';
  if (url.startsWith('/tickets/disputes')) return 'อุทธรณ์คะแนนทีม';
  if (url.startsWith('/admin/snapshot-check')) return 'ตรวจก่อนแช่แข็ง';
  if (url.startsWith('/me/work')) return 'งานของฉัน';
  if (url.startsWith('/me')) return 'ผลงานวันนี้';
  if (url.startsWith('/login')) return 'เข้าสู่ระบบ';
  if (url.startsWith('/analytics')) return 'ศูนย์วิเคราะห์';
  if (url.startsWith('/people/')) return 'โปรไฟล์พนักงาน';
  if (url.startsWith('/people')) return 'ดัชนีพนักงาน';
  if (url.startsWith('/work')) return 'งาน & แผนทีม';
  if (url.startsWith('/tickets')) return 'คะแนนใบงานทีม';
  if (url.startsWith('/schedule')) return 'ปฏิทินทีม & วันลา';
  if (url.startsWith('/queue')) return 'คิวจ่ายงาน';
  if (url.startsWith('/mygit')) return 'ซิงก์ MR ทีม';
  if (url.startsWith('/teams')) return 'แจ้งเตือน Teams';
  if (url.startsWith('/ai')) return 'ติดตามงาน AI';
  if (url.startsWith('/integrations')) return 'เชื่อมต่อระบบ';
  if (url.startsWith('/admin')) return 'หลังบ้าน & สิทธิ์';
  if (url.startsWith('/mockup')) return 'โหมดจำลอง';
  return 'แดชบอร์ดทีม';
}

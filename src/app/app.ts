import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
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
  toggleViewAsMember,
  viewAsRole,
} from './core/admin-settings';
import { AccessRole } from './core/models';
import { ApiClient } from './core/api-client';
import { ShellNotice, shellNoticeCssClass, shellNoticeTitle } from './core/shell-notice';
import { ScorecardService } from './core/scorecard.service';
import { currentSession, setSessionUser } from './core/session';
import { ThemeService } from './core/theme.service';
import { SectionCardComponent, TicketDetailDialogComponent } from './shared/ui';
import { TicketDetailService } from './core/ticket-detail.service';

type NavLeaf = {
  id: string;
  text: string;
  iconCss: string;
  route: string;
  exact?: boolean;
  roles?: readonly AccessRole[];
};
type NavGroup = {
  id: string;
  text: string;
  expanded: boolean;
  roles?: readonly AccessRole[];
  children: NavLeaf[];
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
    SectionCardComponent,
    TicketDetailDialogComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly notice = inject(ShellNotice);
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient);
  private readonly ticketDetail = inject(TicketDetailService);
  protected readonly theme = inject(ThemeService);

  @ViewChild('toast') private toast?: ToastComponent;
  @ViewChild('alertDialog') private alertDialog?: DialogComponent;
  @ViewChild('globalSearchInput') private globalSearchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('saasNav') private saasNav?: ElementRef<HTMLElement>;
  @ViewChild('subnavTabs') private subnavTabs?: ElementRef<HTMLElement>;

  protected readonly activePill = signal({ top: 0, height: 38, visible: false });
  protected readonly subTabPill = signal({ left: 0, width: 0, visible: false });

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
    const menus = allNavLeaves.filter((l) => l.text.toLowerCase().includes(q)).slice(0, 6);
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
  protected readonly menuSearch = signal('');
  protected onMenuSearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.menuSearch.set(target?.value ?? '');
  }
  protected clearMenuSearch(): void {
    this.menuSearch.set('');
  }

  protected readonly activeNavCategory = computed<NavCategory>(() => {
    const id = matchNavId(this.url(), this.role());
    return leafCategory[id] ?? 'work';
  });

  protected readonly categoryLabel = computed(() => categoryMeta[this.activeNavCategory()].label);
  protected readonly categoryHint = computed(() => categoryMeta[this.activeNavCategory()].hint);
  protected readonly visibleRail = computed(() => {
    const leaves = leavesFor(this.role());
    const counts = new Map<NavCategory, number>();
    for (const leaf of leaves) {
      const cat = leafCategory[leaf.id] ?? 'work';
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return categoryOrder
      .filter((id) => (counts.get(id) ?? 0) > 0)
      .map((id) => ({ id, count: counts.get(id) ?? 0, ...categoryMeta[id] }));
  });

  protected readonly activeSubTabs = computed<NavMenuItem[]>(() => {
    const role = this.role();
    const category = this.activeNavCategory();
    const tabs = leavesFor(role)
      .filter((leaf) => (leafCategory[leaf.id] ?? 'work') === category)
      .map((leaf) => ({
        ...leaf,
        category,
        categoryLabel: categoryMeta[category].label,
        groupId: leafGroupId(leaf.id, role),
      }));
    return tabs.map((tab, index) => ({
      ...tab,
      sepBefore: index > 0 && tab.groupId !== tabs[index - 1].groupId,
    }));
  });

  /** Path key so shell can restart enter cascade when the route changes. */
  protected readonly navKey = computed(() => this.url().split('?')[0] || '/');

  protected readonly visibleNavItems = computed<NavMenuItem[]>(() => {
    const role = this.role();
    const query = this.menuSearch().trim().toLowerCase();
    const category = this.activeNavCategory();
    return allNavGroups
      .filter((group) => !group.roles || group.roles.includes(role))
      .flatMap((group) =>
        group.children
          .filter((leaf) => !leaf.roles || leaf.roles.includes(role))
          .filter((leaf) => query || (leafCategory[leaf.id] ?? 'work') === category)
          .filter(
            (leaf) =>
              !query ||
              leaf.text.toLowerCase().includes(query) ||
              group.text.toLowerCase().includes(query),
          )
          .map((leaf) => ({
            ...leaf,
            category: leafCategory[leaf.id] ?? 'work',
            categoryLabel: categoryMeta[leafCategory[leaf.id] ?? 'work'].label,
            groupId: group.id,
          })),
      );
  });

  protected readonly workspaceMenuOpen = signal(false);
  protected toggleWorkspaceMenu(event?: Event): void {
    event?.stopPropagation();
    if (!this.canSwitchMode()) return;
    this.workspaceMenuOpen.update((open) => !open);
  }
  protected closeWorkspaceMenu(): void {
    this.workspaceMenuOpen.set(false);
  }
  protected selectWorkspaceMode(mode: AccessRole): void {
    this.workspaceMenuOpen.set(false);
    this.switchWorkspaceMode(mode);
  }
  protected readonly activeModeMeta = computed(() => {
    const r = this.role();
    if (r === 'admin') {
      return { id: 'admin' as AccessRole, code: 'AD', label: 'แอดมิน & ธรรมาภิบาล', sub: 'Admin Console', color: '#ef4444' };
    }
    if (r === 'lead') {
      return { id: 'lead' as AccessRole, code: 'LD', label: 'บริหารทีม (Lead)', sub: 'Lead Command Center', color: '#f59e0b' };
    }
    return { id: 'member' as AccessRole, code: 'ME', label: 'พื้นที่งานของฉัน', sub: 'Member Workspace', color: '#2e4fc8' };
  });

  protected readonly groupedNavSections = computed<{ id: NavCategory; label: string; items: NavMenuItem[] }[]>(() => {
    const role = this.role();
    const query = this.menuSearch().trim().toLowerCase();
    const leaves = allNavGroups
      .filter((group) => !group.roles || group.roles.includes(role))
      .flatMap((group) =>
        group.children
          .filter((leaf) => !leaf.roles || leaf.roles.includes(role))
          .filter(
            (leaf) =>
              !query ||
              leaf.text.toLowerCase().includes(query) ||
              group.text.toLowerCase().includes(query) ||
              (categoryMeta[leafCategory[leaf.id] ?? 'work']?.label.toLowerCase().includes(query) ?? false),
          )
          .map((leaf) => ({
            ...leaf,
            category: leafCategory[leaf.id] ?? 'work',
            categoryLabel: categoryMeta[leafCategory[leaf.id] ?? 'work'].label,
            groupId: group.id,
          })),
      );

    return categoryOrder
      .map((cat) => ({
        id: cat,
        label: categoryMeta[cat].label,
        items: leaves.filter((item) => item.category === cat),
      }))
      .filter((section) => section.items.length > 0);
  });

  protected selectRailCategory(cat: NavCategory): void {
    // Keep desktop rail collapsed when switching pages — expand only via toggleNav().
    const leaf = firstLeaf(this.role(), cat);
    if (leaf) {
      void this.router.navigateByUrl(leaf.route);
    }
  }
  protected readonly selectedNodes = signal<string[]>(['me']);
  protected readonly availableModes = computed(() => {
    const actual = this.trueRole();
    const list: { id: AccessRole; label: string; shortLabel: string; icon: string }[] = [
      { id: 'member', label: 'งานของฉัน', shortLabel: 'ของฉัน', icon: 'e-icons e-user' },
    ];
    if (actual === 'lead' || actual === 'admin') {
      list.push({ id: 'lead', label: 'บริหารทีม', shortLabel: 'ทีม', icon: 'e-icons e-people' });
    }
    if (actual === 'admin') {
      list.push({ id: 'admin', label: 'แอดมิน', shortLabel: 'แอดมิน', icon: 'e-icons e-lock' });
    }
    return list;
  });
  protected readonly canSwitchMode = computed(() => this.availableModes().length > 1);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
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
    if (role === 'admin') return 'โหมดแอดมิน · Admin';
    if (role === 'lead' && actual === 'admin') return 'มุมมอง Lead · สิทธิ์จริง Admin';
    if (role === 'lead') return 'โหมดบริหารทีม · Lead';
    if (role === 'member' && actual !== 'member') {
      return actual === 'admin' ? 'มุมมอง Member · สิทธิ์จริง Admin' : 'มุมมอง Member · สิทธิ์จริง Lead';
    }
    return 'โหมดงานของฉัน · Member';
  });
  protected readonly roleBadgeTone = computed<'danger' | 'warning' | 'info'>(() => {
    const role = this.role();
    if (role === 'admin') return 'danger';
    if (role === 'lead') return 'warning';
    return 'info';
  });
  /** true เมื่อโหมดเมนูต่างจากสิทธิ์จริง (เช่น แอดมินถูกพาไปมุมมอง Lead) */
  protected readonly viewingBorrowedMode = computed(() => this.role() !== this.trueRole());
  private lastAutoModeNoticeKey = '';

  constructor() {
    const media = window.matchMedia('(max-width: 800px)');
    this.narrow.set(media.matches);
    this.navOpen.set(!media.matches);
    media.addEventListener('change', (event) => {
      this.narrow.set(event.matches);
      this.navOpen.set(!event.matches);
    });
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe((event) => {
      if (this.narrow() && !this.keepNavOpen) {
        this.navOpen.set(false);
      }
      this.keepNavOpen = false;
      const path = event.urlAfterRedirects.split('?')[0] || '/';
      const actual = this.trueRole();
      if (path === '/me' || path.startsWith('/me/')) {
        if (this.role() !== 'member') {
          this.applyAutoWorkspaceMode('member', path, 'สลับชั่วคราวเป็นมุมมองงานของฉัน — สิทธิ์จริงยังไม่เปลี่ยน');
        }
      } else if (
        actual === 'admin' &&
        (path === '/admin' ||
          path.startsWith('/admin/') ||
          path.startsWith('/integrations') ||
          path.startsWith('/teams') ||
          path.startsWith('/mockup'))
      ) {
        if (this.role() !== 'admin') {
          this.applyAutoWorkspaceMode('admin', path, 'กลับโหมดแอดมินเพื่อตั้งค่าระบบ');
        }
      } else if (
        actual !== 'member' &&
        (path === '/team' ||
          path.startsWith('/work') ||
          path.startsWith('/queue') ||
          path.startsWith('/quality') ||
          path.startsWith('/schedule') ||
          path.startsWith('/mygit') ||
          path.startsWith('/ai'))
      ) {
        if (this.role() !== 'lead') {
          this.applyAutoWorkspaceMode(
            'lead',
            path,
            actual === 'admin'
              ? 'สลับชั่วคราวเป็นมุมมองบริหารทีมเพื่อเปิดงาน/บอร์ด — สิทธิ์แอดมินยังอยู่ (กด «กลับโหมดจริง» ได้)'
              : 'สลับเข้ามุมมองบริหารทีม',
          );
        }
      } else if (
        actual !== 'member' &&
        (path.startsWith('/people') ||
          path.startsWith('/analytics') ||
          path.startsWith('/tickets'))
      ) {
        if (this.role() === 'member') {
          this.applyAutoWorkspaceMode(
            actual === 'admin' ? 'admin' : 'lead',
            path,
            'กลับจากมุมมอง Member เพื่อเปิดหน้าระดับทีม/องค์กร',
          );
        }
      }
    });
    effect(() => {
      this.selectedNodes.set([matchNavId(this.url(), this.role())]);
      // Track layout dependencies so the sliding white pill glides accurately
      this.role();
      this.collapsed();
      this.menuSearch();
      this.activeNavCategory();
      this.scheduleActivePillSync();
      queueMicrotask(() => this.observeSubnavTabs());
    });
    window.addEventListener('keydown', (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        this.focusGlobalSearch();
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
    this.switchWorkspaceMode('member');
  }

  protected openLogin(): void {
    void this.router.navigate(['/login']);
  }

  protected switchWorkspaceMode(mode: AccessRole): void {
    const category = this.activeNavCategory();
    const next = setWorkspaceMode(mode);
    const target = firstLeaf(next, category) ?? firstLeaf(next);
    this.menuSearch.set('');
    this.keepNavOpen = true;
    this.lastAutoModeNoticeKey = '';
    if (next === 'member') {
      this.notice.info('สลับเข้าสู่โหมด "งานของฉัน" (Member Workspace)');
    } else if (next === 'lead') {
      this.notice.info('สลับเข้าสู่โหมด "บริหารทีม" (Lead Command Center)');
    } else {
      this.notice.info('สลับเข้าสู่โหมด "แอดมิน" (Admin & Governance Console)');
    }
    if (target) {
      void this.router.navigateByUrl(target.route);
    }
  }

  /** กลับโหมดตามสิทธิ์จริงโดยไม่เปลี่ยนบัญชีที่ล็อกอิน */
  protected restoreTrueWorkspaceMode(): void {
    const actual = this.trueRole();
    if (this.role() === actual) {
      return;
    }
    this.lastAutoModeNoticeKey = '';
    setWorkspaceMode(actual);
    this.menuSearch.set('');
    this.keepNavOpen = true;
    this.notice.success(
      actual === 'admin'
        ? 'กลับโหมดแอดมินแล้ว'
        : actual === 'lead'
          ? 'กลับโหมดบริหารทีมแล้ว'
          : 'กลับโหมดงานของฉันแล้ว',
    );
    const target = firstLeaf(actual) ?? firstLeaf(actual, 'cockpit');
    if (target) {
      void this.router.navigateByUrl(target.route);
    }
  }

  private applyAutoWorkspaceMode(mode: AccessRole, path: string, message: string): void {
    const prev = this.role();
    if (prev === mode) {
      return;
    }
    setWorkspaceMode(mode);
    const key = `${prev}->${mode}|${path.split('/').slice(0, 3).join('/')}`;
    if (this.lastAutoModeNoticeKey === key) {
      return;
    }
    this.lastAutoModeNoticeKey = key;
    this.notice.info(message, 'สลับมุมมองเมนู');
  }

  protected togglePersonaPreview(): void {
    const next = toggleViewAsMember();
    if (next === 'member') {
      this.notice.info('สลับเป็นมุมมองพนักงานทั่วไป (Member View)');
      void this.router.navigate(['/me']);
    } else {
      this.notice.info(`กลับสู่มุมมอง ${next === 'lead' ? 'บริหารทีม' : 'แอดมิน'}`);
      void this.router.navigate([next === 'lead' ? '/team' : '/admin']);
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

  private scheduleActivePillSync(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.syncActivePill();
        this.syncSubTabPill();
      });
    });
  }

  private syncActivePill(): void {
    const nav = this.saasNav?.nativeElement;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('.saas-nav__item.is-active');
    if (!active) {
      this.activePill.update((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    const top = Math.round(itemRect.top - navRect.top + nav.scrollTop);
    const height = Math.round(itemRect.height);
    this.activePill.set({ top, height, visible: true });
  }

  private syncSubTabPill(): void {
    const bar = this.subnavTabs?.nativeElement;
    if (!bar) {
      this.subTabPill.update((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    const active = bar.querySelector<HTMLElement>('.subnav-tab.is-active');
    if (!active) {
      this.subTabPill.update((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    const barRect = bar.getBoundingClientRect();
    const tabRect = active.getBoundingClientRect();
    const left = Math.round(tabRect.left - barRect.left + bar.scrollLeft);
    const width = Math.round(tabRect.width);
    this.subTabPill.set({ left, width, visible: true });
  }

  private pillResizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    this.notice.bind((payload) => {
      const type = payload.type ?? 'info';
      this.toast?.show({
        title: shellNoticeTitle(type, payload.title),
        content: payload.text,
        cssClass: shellNoticeCssClass(type),
      });
    });
    this.scheduleActivePillSync();
    if (typeof ResizeObserver !== 'undefined') {
      this.pillResizeObserver = new ResizeObserver(() => this.scheduleActivePillSync());
      if (this.saasNav?.nativeElement) this.pillResizeObserver.observe(this.saasNav.nativeElement);
      this.observeSubnavTabs();
    }
  }

  private observeSubnavTabs(): void {
    const el = this.subnavTabs?.nativeElement;
    if (el && this.pillResizeObserver) {
      this.pillResizeObserver.observe(el);
    }
  }
}

type NavCategory = 'cockpit' | 'work' | 'quality' | 'analytics' | 'admin';

type NavMenuItem = NavLeaf & {
  category: NavCategory;
  categoryLabel: string;
  groupId: string;
  sepBefore?: boolean;
};

const categoryMeta: Record<NavCategory, { label: string; hint: string; rail: string; icon: string; title: string }> = {
  cockpit: {
    label: 'ห้องบัญชาการ',
    hint: 'แดชบอร์ดและภาพรวม',
    rail: 'Cockpit',
    icon: 'e-icons e-grid-view',
    title: 'ห้องบัญชาการและภาพรวม',
  },
  work: {
    label: 'งาน & แผน',
    hint: 'คิว ฮับ ปฏิทิน และส่งต่อ',
    rail: 'งาน',
    icon: 'e-icons e-timeline-work-week',
    title: 'ฮับงานค้าง แผนทีม และคิวงาน',
  },
  quality: {
    label: 'คุณภาพ & คะแนน',
    hint: 'ตรวจรับ คะแนน และเวลา',
    rail: 'คุณภาพ',
    icon: 'e-icons e-check-box',
    title: 'ตรวจสอบคุณภาพ คะแนน และเวลา',
  },
  analytics: {
    label: 'AI วิเคราะห์',
    hint: 'สถิติ โปรไฟล์ และ MR',
    rail: 'AI วิเคราะห์',
    icon: 'e-icons e-chart',
    title: 'วิเคราะห์สถิติและ AI Coach',
  },
  admin: {
    label: 'ตั้งค่าระบบ',
    hint: 'สิทธิ์ เกณฑ์ และการเชื่อมต่อ',
    rail: 'จัดการ',
    icon: 'e-icons e-settings',
    title: 'ตั้งค่าระบบและธรรมาภิบาล',
  },
};

const categoryOrder: NavCategory[] = ['cockpit', 'work', 'quality', 'analytics', 'admin'];

const categoryLanding: Partial<Record<NavCategory, readonly string[]>> = {
  cockpit: ['my-cockpit', 'team-cockpit', 'admin-cockpit', 'team-dash', 'people', 'admin-people'],
  work: ['me', 'work-hub', 'my-work', 'queue', 'my-time-log', 'schedule'],
  quality: ['quality-audit', 'my-tickets', 'admin-time-audit', 'time-audit', 'my-disputes', 'admin-tickets'],
  analytics: ['analytics', 'admin-analytics', 'my-analytics', 'lead-mockup'],
  admin: ['admin-home'],
};

const leafCategory: Record<string, NavCategory> = {
  me: 'cockpit',
  'my-cockpit': 'cockpit',
  'my-work': 'work',
  'my-board': 'work',
  'my-timeline': 'work',
  'my-schedule': 'work',
  'my-time-log': 'work',
  'my-mygit': 'analytics',
  'my-ai': 'analytics',
  'my-analytics': 'analytics',
  'my-tickets': 'quality',
  'my-time-audit': 'quality',
  'my-disputes': 'quality',
  'team-dash': 'cockpit',
  'team-cockpit': 'cockpit',
  people: 'cockpit',
  queue: 'work',
  'work-hub': 'work',
  'work-board': 'work',
  'work-timeline': 'work',
  schedule: 'work',
  'work-handoff': 'work',
  'work-team-time': 'work',
  'quality-audit': 'quality',
  disputes: 'quality',
  tickets: 'quality',
  'time-audit': 'quality',
  analytics: 'analytics',
  mygit: 'analytics',
  ai: 'analytics',
  'lead-mockup': 'analytics',
  'admin-home': 'admin',
  'admin-cockpit': 'cockpit',
  'admin-analytics': 'analytics',
  'admin-time-audit': 'quality',
  'admin-tickets': 'quality',
  'admin-people': 'cockpit',
  integrations: 'admin',
  'snapshot-check': 'admin',
  rubrics: 'admin',
  teams: 'admin',
  mockup: 'admin',
  login: 'admin',
};

const allNavGroups: NavGroup[] = [
  // ==========================================
  // โหมดที่ 1: งานของฉัน (Member Workspace)
  // ==========================================
  {
    id: 'mine-home',
    text: 'ภาพรวมผลงานของฉัน',
    expanded: true,
    roles: ['member'],
    children: [
      { id: 'me', text: 'ผลงาน & งานวันนี้', iconCss: 'e-icons e-user', route: '/me', exact: true },
      { id: 'my-cockpit', text: 'ค็อกพิทผลงานของฉัน (Bento)', iconCss: 'e-icons e-grid-view', route: '/me/cockpit' },
    ],
  },
  {
    id: 'mine-daily',
    text: 'จัดการใบงานประจำวัน',
    expanded: true,
    roles: ['member'],
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
    roles: ['member'],
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
    roles: ['member'],
    children: [
      { id: 'my-analytics', text: 'วิเคราะห์ผลงานเชิงลึก (OLS)', iconCss: 'e-icons e-chart', route: '/me/analytics' },
      { id: 'my-mygit', text: 'ซิงก์ MR ของฉัน', iconCss: 'e-icons e-refresh', route: '/me/mygit' },
      { id: 'my-ai', text: 'ติดตามงาน AI ของฉัน', iconCss: 'e-icons e-chart', route: '/me/ai' },
    ],
  },

  // ==========================================
  // โหมดที่ 2: บริหารทีม (Lead Command Center)
  // ==========================================
  {
    id: 'lead-overview',
    text: 'ภาพรวมทีม & คน',
    expanded: true,
    roles: ['lead'],
    children: [
      { id: 'team-dash', text: 'แดชบอร์ดทีม', iconCss: 'e-icons e-home', route: '/team' },
      { id: 'team-cockpit', text: 'ห้องบัญชาการ Bento (Cockpit)', iconCss: 'e-icons e-grid-view', route: '/cockpit' },
      { id: 'people', text: 'รายชื่อและโปรไฟล์ลูกทีม', iconCss: 'e-icons e-people', route: '/people', exact: true },
    ],
  },
  {
    id: 'lead-plan',
    text: 'บริหารแผน & จ่ายงานทีม',
    expanded: true,
    roles: ['lead'],
    children: [
      { id: 'queue', text: 'คิวงานใหม่ & จ่ายงาน', iconCss: 'e-icons e-list-unordered', route: '/queue' },
      { id: 'work-hub', text: 'ฮับงานค้าง & แผนทีม', iconCss: 'e-icons e-timeline-work-week', route: '/work', exact: true },
      { id: 'schedule', text: 'ปฏิทินทีม & วันลา', iconCss: 'e-icons e-timeline-today', route: '/schedule' },
    ],
  },
  {
    id: 'lead-quality',
    text: 'ตรวจรับ & คะแนนทีม',
    expanded: true,
    roles: ['lead'],
    children: [
      { id: 'quality-audit', text: 'ตรวจรับคุณภาพ QA (DoD)', iconCss: 'e-icons e-check-box', route: '/quality/audit' },
      { id: 'disputes', text: 'ศูนย์อนุมัติอุทธรณ์ทีม', iconCss: 'e-icons e-edit', route: '/tickets/disputes' },
      { id: 'tickets', text: 'ตารางคะแนนใบงานทีม', iconCss: 'e-icons e-table', route: '/tickets' },
      { id: 'time-audit', text: 'ตรวจสอบเวลา 3 ทางทีม', iconCss: 'e-icons e-clock', route: '/analytics/time-audit' },
    ],
  },
  {
    id: 'lead-intel',
    text: 'วิเคราะห์ & ซิงก์ทีม',
    expanded: true,
    roles: ['lead'],
    children: [
      { id: 'analytics', text: 'ศูนย์วิเคราะห์ & Coaching', iconCss: 'e-icons e-chart', route: '/analytics' },
      { id: 'mygit', text: 'ซิงก์ mygit (MR) ทีม', iconCss: 'e-icons e-refresh', route: '/mygit' },
      { id: 'ai', text: 'ติดตามงาน AI ทีม', iconCss: 'e-icons e-chart', route: '/ai' },
      { id: 'lead-mockup', text: 'โหมดจำลองระบบ (Mockup)', iconCss: 'e-icons e-play', route: '/mockup' },
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
      { id: 'admin-analytics', text: 'ศูนย์วิเคราะห์ Python & AI', iconCss: 'e-icons e-chart', route: '/analytics' },
      { id: 'admin-time-audit', text: 'ตรวจสอบเวลา 3 ทางองค์กร', iconCss: 'e-icons e-clock', route: '/analytics/time-audit' },
      { id: 'admin-tickets', text: 'ตารางคะแนนรวมทั้งองค์กร', iconCss: 'e-icons e-table', route: '/tickets' },
    ],
  },
];

const allNavLeaves = allNavGroups.flatMap((group) => group.children);

function leavesFor(role: AccessRole): NavLeaf[] {
  return allNavGroups
    .filter((group) => !group.roles || group.roles.includes(role))
    .flatMap((group) => group.children.filter((leaf) => !leaf.roles || leaf.roles.includes(role)));
}

function leafGroupId(leafId: string, role: AccessRole): string {
  for (const group of allNavGroups) {
    if (group.roles && !group.roles.includes(role)) continue;
    if (group.children.some((leaf) => leaf.id === leafId && (!leaf.roles || leaf.roles.includes(role)))) {
      return group.id;
    }
  }
  return 'other';
}

function firstLeaf(role: AccessRole, category?: NavCategory): NavLeaf | undefined {
  const leaves = leavesFor(role).filter((leaf) => !category || (leafCategory[leaf.id] ?? 'work') === category);
  const preferred = category ? categoryLanding[category] ?? [] : [];
  for (const id of preferred) {
    const hit = leaves.find((leaf) => leaf.id === id);
    if (hit) {
      return hit;
    }
  }
  return leaves[0];
}

function matchNavId(url: string, role: AccessRole = 'member'): string {
  const path = url.split('?')[0] || '/';
  const pool = leavesFor(role);
  // มุมมองย่อยของ Work Hub (Board/Timeline/…) ไฮไลต์ที่ฮับ ไม่แยกเมนูซ้ำ
  if (path.startsWith('/me/work')) {
    return 'my-work';
  }
  if (path.startsWith('/work')) {
    return 'work-hub';
  }
  if (path.startsWith('/me/analytics')) {
    return 'my-analytics';
  }
  if (path.startsWith('/me/tickets')) {
    return 'my-tickets';
  }
  if (path.startsWith('/me/schedule')) {
    return 'my-schedule';
  }
  if (path.startsWith('/me/time-log')) {
    return 'my-time-log';
  }
  if (path.startsWith('/me/time-audit')) {
    return 'my-time-audit';
  }
  if (path.startsWith('/me/mygit')) {
    return 'my-mygit';
  }
  if (path.startsWith('/me/ai')) {
    return 'my-ai';
  }
  if (path.startsWith('/me/disputes')) {
    return 'my-disputes';
  }
  if (path.startsWith('/people/') && path !== '/people') {
    return role === 'member' ? 'my-analytics' : role === 'admin' ? 'admin-people' : 'people';
  }
  const exactHit = pool.find((item) => path === item.route);
  if (exactHit) {
    return exactHit.id;
  }
  const prefixHits = pool
    .filter((item) => !item.exact && path.startsWith(`${item.route}/`))
    .sort((a, b) => b.route.length - a.route.length);
  if (prefixHits[0]) {
    return prefixHits[0].id;
  }
  return pool[0]?.id ?? 'me';
}

function screenTitle(url: string): string {
  if (url.startsWith('/me/cockpit')) {
    return 'ค็อกพิทผลงานของฉัน (Personal Bento)';
  }
  if (url.startsWith('/cockpit')) {
    return 'ห้องบัญชาการ Bento (Executive Team Cockpit)';
  }
  if (url.startsWith('/admin/rubrics')) {
    return 'ทะเบียนเกณฑ์มาตรฐาน (Rubric Registry)';
  }
  if (url.startsWith('/work/team-time')) {
    return 'เวลาทีมรายวัน (Team Time Matrix)';
  }
  if (url.startsWith('/me/time-log')) {
    return 'ลงเวลางานของฉัน';
  }
  if (url.startsWith('/work/handoff')) {
    return 'ตรวจสอบการส่งต่อ & SLA ข้ามทีม';
  }
  if (url.startsWith('/work/board')) {
    return 'กระดานงานทีม (Team Kanban Board)';
  }
  if (url.startsWith('/work/timeline')) {
    return 'ไทม์ไลน์งานทีม (Team Gantt Chart)';
  }
  if (url.startsWith('/quality/audit')) {
    return 'ตรวจสอบคุณภาพ QA & Defect Audit';
  }
  if (url.startsWith('/me/work/board')) {
    return 'กระดานงานของฉัน (My Kanban Board)';
  }
  if (url.startsWith('/me/work/timeline')) {
    return 'ไทม์ไลน์งานของฉัน (My Gantt Chart)';
  }
  if (url.startsWith('/me/analytics')) {
    return 'วิเคราะห์ผลงานเชิงลึกของฉัน (Self-Analytics & OLS)';
  }
  if (url.startsWith('/me/tickets')) {
    return 'ตารางคะแนนใบงานของฉัน';
  }
  if (url.startsWith('/me/schedule')) {
    return 'ปฏิทินงานและวันลาของฉัน';
  }
  if (url.startsWith('/me/time-audit')) {
    return 'ตรวจสอบเวลา 3 ทางของฉัน';
  }
  if (url.startsWith('/me/mygit')) {
    return 'ซิงก์ GitLab MR ของฉัน';
  }
  if (url.startsWith('/me/ai')) {
    return 'ติดตามงาน AI & Spike ของฉัน';
  }
  if (url.startsWith('/me/disputes')) {
    return 'ศูนย์ทบทวนและอุทธรณ์คะแนนของฉัน';
  }
  if (url.startsWith('/analytics/time-audit')) {
    return 'ตรวจสอบเวลา 3 ทาง (3-Way Time Audit)';
  }
  if (url.startsWith('/tickets/disputes')) {
    return 'ศูนย์อนุมัติคำขออุทธรณ์คะแนนทีม';
  }
  if (url.startsWith('/admin/snapshot-check')) {
    return 'ตรวจสอบความพร้อมก่อนแช่แข็งคะแนน';
  }
  if (url.startsWith('/me/work')) {
    return 'ฮับงานของฉัน (ค้าง/บอร์ด)';
  }
  if (url.startsWith('/me')) {
    return 'ผลงานและงานวันนี้ของฉัน';
  }
  if (url.startsWith('/login')) {
    return 'เข้าสู่ระบบ & สลับบทบาท';
  }
  if (url.startsWith('/analytics')) {
    return 'ศูนย์วิเคราะห์ข้อมูล & Coaching ทีม';
  }
  if (url.startsWith('/people/')) {
    return 'โปรไฟล์และวิเคราะห์รายบุคคล';
  }
  if (url.startsWith('/people')) {
    return 'รายชื่อและดัชนีพนักงาน';
  }
  if (url.startsWith('/work')) {
    return 'ฮับงานค้าง & แผนทีม';
  }
  if (url.startsWith('/tickets')) {
    return 'ตารางคะแนนใบงานทีม';
  }
  if (url.startsWith('/schedule')) {
    return 'ปฏิทินทีม & วันลา';
  }
  if (url.startsWith('/queue')) {
    return 'คิวงานใหม่ & จ่ายงาน';
  }
  if (url.startsWith('/mygit')) {
    return 'ซิงก์ mygit (MR) ทีม';
  }
  if (url.startsWith('/teams')) {
    return 'ตั้งค่าแจ้งเตือน Microsoft Teams';
  }
  if (url.startsWith('/ai')) {
    return 'ติดตามงาน AI ทีม';
  }
  if (url.startsWith('/integrations')) {
    return 'เชื่อมต่อระบบภายนอก (Integrations)';
  }
  if (url.startsWith('/admin')) {
    return 'หลังบ้าน & สิทธิ์ผู้ใช้';
  }
  if (url.startsWith('/mockup')) {
    return 'โหมดจำลองระบบ';
  }
  return 'แดชบอร์ดทีม';
}

import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, NgZone, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { AppBarModule, SidebarModule } from '@syncfusion/ej2-angular-navigations';
import { ToastComponent, ToastModule } from '@syncfusion/ej2-angular-notifications';
import { filter, map, startWith } from 'rxjs';
import {
  actualRole,
  currentViewer,
  effectiveRole,
  openprojectProjectCatalog,
  setWorkspaceMode,
  teamStagingMode,
  toggleViewAsMember,
  viewAsRole,
} from './core/admin-settings';
import { AccessRole } from './core/models';
import { ApiClient, registerUnauthorizedHandler } from './core/api-client';
import { ShellNotice, shellNoticeCssClass, shellNoticeTitle } from './core/shell-notice';
import { ScorecardService } from './core/scorecard.service';
import { currentSession, setSessionUser } from './core/session';
import { ThemeService } from './core/theme.service';
import { WorkspaceFilter } from './core/workspace-filter';
import { FilterChipsComponent } from './shared/ui/filter-chips/filter-chips';
import {
  isFailedAvatarKey,
  PersonAvatarComponent,
  recordFailedAvatar,
} from './shared/ui/person-avatar/person-avatar';
import { SectionCardComponent } from './shared/ui/section-card/section-card';
import { TicketDetailDialogComponent } from './shared/ui/ticket-detail-dialog/ticket-detail-dialog';
import { SfDatePickerComponent } from './shared/sf/sf-datepicker/sf-datepicker';
import { SfDialogComponent } from './shared/sf/sf-dialog/sf-dialog';
import { SfDropdownComponent } from './shared/sf/sf-dropdown/sf-dropdown';
import { SfMessageComponent } from './shared/sf/sf-message/sf-message';
import { SfTextBoxComponent } from './shared/sf/sf-textbox/sf-textbox';
import { TicketDetailService } from './core/ticket-detail.service';
import {
  ADMIN_SIDEBAR_SECTION,
  ContextualTab,
  MANAGER_SIDEBAR_SECTION,
  NavLeaf,
  SHARED_WORKSPACE_SECTION,
  SidebarSection,
  buildContextualTabs,
  isManagerOrAdminOnlyPath,
  leavesFor,
  matchNavId,
  memberFallbackPathFor,
  screenTitle,
} from './core/navigation';
import { resolvePersonTeamId } from '../../shared/domain/work-views';

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
    FilterChipsComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    TicketDetailDialogComponent,
    SfDatePickerComponent,
    SfDialogComponent,
    SfDropdownComponent,
    SfMessageComponent,
    SfTextBoxComponent,
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
  protected readonly ticketDetail = inject(TicketDetailService);
  protected readonly theme = inject(ThemeService);
  protected readonly workspaceFilter = inject(WorkspaceFilter);
  protected readonly teamStaging = teamStagingMode;
  protected readonly filterFields = { text: 'text', value: 'value' };

  @ViewChild('toast') private toast?: ToastComponent;
  @ViewChild('alertDialog') private alertDialog?: SfDialogComponent;
  @ViewChild('globalSearchInput') private globalSearchInput?: ElementRef<HTMLInputElement>;
  private saasNav?: ElementRef<HTMLElement>;
  @ViewChild('saasNav') set saasNavRef(ref: ElementRef<HTMLElement> | undefined) {
    this.saasNav = ref;
    this.navResizeObserver?.disconnect();
    this.navResizeObserver = undefined;
    if (ref && typeof ResizeObserver !== 'undefined') {
      this.navResizeObserver = new ResizeObserver(() => this.syncActivePill());
      this.navResizeObserver.observe(ref.nativeElement);
      this.scheduleSyncActivePill();
    }
  }

  protected readonly activePill = signal({ top: 0, height: 36, visible: false });
  protected readonly scrollProgress = signal(0);
  protected readonly showScrollTop = signal(false);
  protected readonly routeAnimParity = signal(false);
  private navResizeObserver?: ResizeObserver;

  protected readonly globalSearch = signal('');
  protected readonly searchOpen = signal(false);
  protected readonly mobileSearchOpen = signal(false);
  protected readonly liveSearching = signal(false);
  protected readonly liveResults = signal<
    { id: string; title: string; status: string; from: 'local' | 'live' }[]
  >([]);

  protected readonly instantResults = computed(() => {
    const q = this.globalSearch().trim().toLowerCase();
    if (!q || q.length < 1) {
      return {
        tickets: [] as { id: string; title: string }[],
        people: [] as { id: string; name: string }[],
        projects: [] as { id: string | number; name: string; identifier: string }[],
        menus: [] as NavLeaf[],
      };
    }
    const allowed = this.scorecard.effectiveAllowedTeams();
    const allowedSet = allowed ? new Set(allowed) : null;

    const people = this.scorecard
      .roster()
      .filter((p) => {
        if (allowedSet && !allowedSet.has(resolvePersonTeamId(p))) return false;
        return (
          p.id.toLowerCase().includes(q) ||
          p.nickname.toLowerCase().includes(q) ||
          p.fullName.toLowerCase().includes(q)
        );
      })
      .slice(0, 6)
      .map((p) => ({ id: p.id, name: `${p.nickname} · ${p.fullName}` }));

    const allowedPeopleIds = allowedSet
      ? new Set(
          this.scorecard
            .roster()
            .filter((p) => allowedSet.has(resolvePersonTeamId(p)))
            .map((p) => p.id),
        )
      : null;

    const tickets = this.scorecard
      .tickets()
      .filter((t) => {
        if (allowedPeopleIds && t.assigneeId && !allowedPeopleIds.has(t.assigneeId)) return false;
        return (
          t.id.toLowerCase().includes(q) ||
          (t.title ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 8)
      .map((t) => ({ id: t.id, title: t.title ?? t.id }));

    const projects = openprojectProjectCatalog()
      .filter((p) => {
        if (!p.active) return false;
        if (allowedSet && p.assignedTeamIds && p.assignedTeamIds.length > 0) {
          if (!p.assignedTeamIds.some((tid) => allowedSet.has(tid))) return false;
        }
        return (
          String(p.id).includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.identifier.toLowerCase().includes(q)
        );
      })
      .slice(0, 5)
      .map((p) => ({ id: p.id || p.identifier, name: p.name, identifier: p.identifier }));

    const menus = leavesFor(this.role())
      .filter((l) => l.text.toLowerCase().includes(q))
      .slice(0, 6);
    return { tickets, people, projects, menus };
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

  protected onWorkspaceTeam(value: string): void {
    this.workspaceFilter.setTeam(value ?? '');
  }

  protected onWorkspacePerson(value: string): void {
    this.workspaceFilter.setPerson(value ?? '');
  }

  protected toggleMineFilter(): void {
    this.workspaceFilter.toggleMineOnly();
  }

  protected onWorkspaceProject(value: string): void {
    this.workspaceFilter.setProject(value ?? '');
  }

  protected onWorkspaceType(value: string): void {
    this.workspaceFilter.setType(value ?? '');
  }

  protected onWorkspaceTrack(value: string): void {
    this.workspaceFilter.setTrack(value);
  }

  protected onWorkspaceCycle(value: string): void {
    this.workspaceFilter.setCycle(value ?? '');
  }

  protected onWorkspaceYear(value: string): void {
    this.workspaceFilter.setYear(value ?? '');
  }

  protected onWorkspaceFrom(iso: string): void {
    this.workspaceFilter.setFromDate(iso ?? '');
  }

  protected onWorkspaceTo(iso: string): void {
    this.workspaceFilter.setToDate(iso ?? '');
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
    if (path.startsWith('/quality/mockup')) {
      return false;
    }
    return (
      path === '/cockpit' ||
      path === '/team' ||
      path.startsWith('/team/') ||
      path === '/people' ||
      path === '/schedule' ||
      path.startsWith('/schedule/') ||
      path.startsWith('/work') ||
      path.startsWith('/quality') ||
      path.startsWith('/mygit') ||
      path.startsWith('/tickets') ||
      path.startsWith('/analytics')
    );
  });

  protected readonly statusScopeOptions: { text: string; value: string }[] = [
    { text: 'งานเปิดอยู่ (ยังไม่ปิด)', value: 'unclosed' },
    { text: 'งานที่ปิดแล้ว', value: 'closed' },
    { text: 'ทุกสถานะ', value: 'all' },
  ];

  protected onWorkspaceStatusScope(value: string): void {
    if (value === 'unclosed' || value === 'closed' || value === 'all') {
      this.workspaceFilter.setStatusScope(value);
    }
  }

  protected readonly extraFilterCount = computed(() => {
    let count = 0;
    if (this.workspaceFilter.statusScope() !== 'unclosed') count++;
    if (this.workspaceFilter.yearCe() != null) count++;
    if (this.workspaceFilter.fromDate() || this.workspaceFilter.toDate()) count++;
    if (this.workspaceFilter.opProject()) count++;
    if (this.workspaceFilter.opType()) count++;
    if (this.role() !== 'member' && this.workspaceFilter.track() && this.workspaceFilter.track() !== 'All') count++;
    return count;
  });

  protected clearWorkspaceFilter(): void {
    this.workspaceFilter.clear();
  }

  protected clearWorkspacePerson(): void {
    this.workspaceFilter.setPerson('');
  }

  protected focusGlobalSearch(): void {
    this.searchOpen.set(true);
    if (typeof window !== 'undefined' && window.innerWidth <= 720) {
      this.mobileSearchOpen.set(true);
    }
    queueMicrotask(() => this.globalSearchInput?.nativeElement.focus());
  }
  protected toggleMobileSearch(): void {
    const next = !this.mobileSearchOpen();
    this.mobileSearchOpen.set(next);
    this.searchOpen.set(next);
    if (next) {
      queueMicrotask(() => this.globalSearchInput?.nativeElement.focus());
    }
  }
  protected closeSearchPanel(): void {
    this.searchOpen.set(false);
    this.mobileSearchOpen.set(false);
  }
  protected openTicketFromSearch(id: string): void {
    this.ticketDetail.open(id);
    this.globalSearch.set('');
    this.liveResults.set([]);
    this.searchOpen.set(false);
    this.mobileSearchOpen.set(false);
  }

  protected openTicketFromAlert(id: string): void {
    if (!id) return;
    this.ticketDetail.open(id);
    this.closeAlerts();
  }
  protected goPersonFromSearch(id: string): void {
    void this.router.navigate(['/people', id]);
    this.globalSearch.set('');
    this.searchOpen.set(false);
    this.mobileSearchOpen.set(false);
  }
  protected goMenuFromSearch(route: string): void {
    void this.router.navigateByUrl(route);
    this.globalSearch.set('');
    this.searchOpen.set(false);
    this.mobileSearchOpen.set(false);
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
  protected goProjectFromSearch(id: string | number): void {
    this.router.navigate(['/org/projects', id]);
    this.searchOpen.set(false);
    this.mobileSearchOpen.set(false);
    this.globalSearch.set('');
  }

  protected onGlobalSearchSubmit(): void {
    const q = this.globalSearch().trim().toLowerCase();
    if (!q) return;

    const instant = this.instantResults();
    if (instant.tickets.length === 1) {
      this.openTicketFromSearch(instant.tickets[0]!.id);
      return;
    }
    if (instant.projects.length === 1 && instant.tickets.length === 0) {
      this.goProjectFromSearch(instant.projects[0]!.id);
      return;
    }
    if (instant.people.length === 1 && instant.tickets.length === 0 && instant.projects.length === 0) {
      this.goPersonFromSearch(instant.people[0]!.id);
      return;
    }
    if (
      instant.menus.length === 1 &&
      instant.tickets.length === 0 &&
      instant.people.length === 0 &&
      instant.projects.length === 0
    ) {
      this.goMenuFromSearch(instant.menus[0]!.route);
      return;
    }

    if (instant.projects[0] && instant.tickets.length === 0) {
      this.goProjectFromSearch(instant.projects[0].id);
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
  protected readonly bootstrapState = this.scorecard.bootstrapState;
  protected readonly bootstrapError = this.scorecard.bootstrapError;
  protected readonly hasActiveSession = computed(
    () => Boolean(currentSession()) || this.mockMode(),
  );
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
  protected readonly userAvatarProxyUrl = computed(() => {
    const p = this.currentPerson();
    if (!p || !this.scorecard.usingApi()) return null;
    const raw = (p.avatarUrl ?? '').trim();
    const m = /\/(?:api\/v3\/)?users\/(\d+)\/avatar/i.exec(raw);
    const opId = p.openprojectUserId ?? (m ? Number(m[1]) : null);
    if (!opId) return null;
    if (isFailedAvatarKey(p.id) || isFailedAvatarKey(String(opId)) || isFailedAvatarKey(`op:${opId}`)) {
      return null;
    }
    return `/api/integrations/openproject/users/${opId}/avatar`;
  });
  protected readonly avatarFailed = signal(false);
  protected readonly userAvatarUrl = computed(() => {
    if (this.avatarFailed()) return null;
    const proxy = this.userAvatarProxyUrl();
    if (proxy) return proxy;
    const raw = (this.currentPerson()?.avatarUrl ?? '').trim();
    if (!raw || /(?:\/(?:api\/v3\/)?users\/\d+\/avatar|gravatar\.com\/avatar\/)/i.test(raw)) return null;
    return raw;
  });
  protected readonly avatarError = computed(() => this.avatarFailed() || !this.userAvatarUrl());
  private readonly resetUserAvatarOnChange = effect(() => {
    this.currentPerson()?.id;
    this.avatarFailed.set(false);
  });
  protected onAvatarError(): void {
    const p = this.currentPerson();
    if (p) {
      const keys: string[] = [p.id];
      if (p.openprojectUserId != null) {
        keys.push(String(p.openprojectUserId), `op:${p.openprojectUserId}`);
      }
      recordFailedAvatar(keys);
    }
    this.avatarFailed.set(true);
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
      // ป้าย「งานของฉัน」— route ยังเป็น /work (scope=mine)
      const shared: SidebarSection = {
        ...SHARED_WORKSPACE_SECTION,
        items: SHARED_WORKSPACE_SECTION.items.map((item) =>
          item.id === 'hub-work' ? { ...item, text: 'งานของฉัน' } : item,
        ),
      };
      return [shared];
    }
    // Admin: 「พนักงาน & ทีม」จุดเดียวใต้ตั้งค่าระบบ — ไม่ซ้ำ「คนในทีม」ในบริหารทีม
    if (role === 'admin') {
      return [SHARED_WORKSPACE_SECTION, ADMIN_SIDEBAR_SECTION];
    }
    // Lead: 「คนในทีม」ใต้บริหารทีม
    return [SHARED_WORKSPACE_SECTION, MANAGER_SIDEBAR_SECTION];
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

  protected readonly selectedNodes = signal<string[]>(['hub-home']);
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
  protected readonly title = computed(() => screenTitle(this.url(), this.role()));
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
  private handlingUnauthorized = false;

  private handleUnauthorized(): void {
    if (this.handlingUnauthorized || this.mockMode()) return;
    this.handlingUnauthorized = true;
    const hadSession = Boolean(currentSession());
    this.scorecard.clearSessionState();
    if (hadSession) {
      this.notice.warning('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }
    if (!this.router.url.startsWith('/login')) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url },
      });
    }
    setTimeout(() => {
      this.handlingUnauthorized = false;
    }, 1500);
  }

  constructor() {
    registerUnauthorizedHandler(() => this.handleUnauthorized());
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
      // Smooth scroll back to top and re-trigger friendly route glide animation
      this.routeAnimParity.update((v) => !v);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        const mainEl = document.querySelector<HTMLElement>('.shell-main');
        if (mainEl) mainEl.scrollTo?.({ top: 0, left: 0, behavior: 'smooth' });
      }
      this.scheduleSyncActivePill();
      const path = event.urlAfterRedirects.split('?')[0] || '/';
      const actual = this.trueRole();
      // หากกำลังพรีวิวมุม Member แล้วกดเข้าหน้าเฉพาะหัวหน้าทีม/แอดมิน ให้กลับสิทธิ์จริงอัตโนมัติ
      if (
        actual !== 'member' &&
        this.role() === 'member' &&
        isManagerOrAdminOnlyPath(path)
      ) {
        this.applyAutoWorkspaceMode(
          actual,
          path,
          'ออกจากมุมมองพรีวิว Member เพื่อเปิดหน้าระดับทีม/ตั้งค่าระบบ',
        );
      }
    });
    effect(() => {
      this.selectedNodes.set([matchNavId(this.url(), this.role())]);
    });
    effect(() => {
      // Re-measure sliding sidebar active pill whenever active item, theme, collapse, or sections change
      this.selectedNodes();
      this.theme.theme();
      this.collapsed();
      this.narrow();
      this.sidebarSections();
      this.scheduleSyncActivePill();
    });
    window.addEventListener('keydown', (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        this.focusGlobalSearch();
      } else if (event.key === 'Escape' && (this.searchOpen() || this.mobileSearchOpen())) {
        this.closeSearchPanel();
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

  protected onAlertSearch(value: string): void {
    this.alertSearch.set(value ?? '');
  }

  protected onNavClose(): void {
    if (this.narrow()) {
      this.navOpen.set(false);
    }
  }

  protected openAlerts(): void {
    this.alertDialog?.open();
  }

  protected closeAlerts(): void {
    this.alertDialog?.close();
  }

  protected goToTicketBoard(): void {
    this.alertDialog?.close();
    void this.router.navigate(['/work/board']);
  }

  protected goToTicketScores(): void {
    this.alertDialog?.close();
    void this.router.navigate(['/quality/tickets']);
  }

  protected openMyWorkspace(): void {
    void this.workspaceFilter.navigateWithFilter(['/me']);
  }

  protected openLogin(): void {
    void this.router.navigate(['/login']);
  }

  /** กลับโหมดตามสิทธิ์จริงโดยไม่เปลี่ยนบัญชีที่ล็อกอิน (คงอยู่หน้าเดิมถ้าเป็นวิวมัชฌิม) */
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
    const path = (this.url().split('?')[0] || '/').replace(/\/$/, '') || '/';
    const next = toggleViewAsMember();
    this.keepNavOpen = true;
    if (next === 'member') {
      this.notice.info('กำลังพรีวิวในมุมพนักงาน (Member View) บนชุดเมนูเดียวกัน');
      const fallback = memberFallbackPathFor(path);
      if (fallback && fallback !== path) {
        const commands = fallback.split('/').filter(Boolean);
        void this.workspaceFilter.navigateWithFilter(['/', ...commands]);
      }
    } else {
      this.notice.success(`กลับสู่มุมมอง ${next === 'admin' ? 'Admin' : 'Lead'} แล้ว`);
    }
  }

  protected async retryBootstrap(): Promise<void> {
    await this.scorecard.reloadFromApi();
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
      this.scheduleSyncActivePill();
      this.cdr.markForCheck();
    });

    if (typeof window !== 'undefined') {
      this.zone.runOutsideAngular(() => {
        let ticking = false;
        const onScroll = () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            ticking = false;
            const doc = document.documentElement;
            const max = Math.max(1, doc.scrollHeight - window.innerHeight);
            const ratio = Math.min(1, Math.max(0, window.scrollY / max));
            const shouldShow = window.scrollY > 240;
            if (Math.abs(ratio - this.scrollProgress()) > 0.005 || shouldShow !== this.showScrollTop()) {
              this.zone.run(() => {
                this.scrollProgress.set(ratio);
                this.showScrollTop.set(shouldShow);
              });
            }
          });
        };
        window.addEventListener('scroll', onScroll, { passive: true });
      });
    }
  }

  protected scrollToTop(): void {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  private scheduleSyncActivePill(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.syncActivePill());
    });
  }

  private syncActivePill(): void {
    const nav = this.saasNav?.nativeElement;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('.saas-nav__item.is-active');
    if (!active) {
      this.activePill.update((p) => (p.visible ? { ...p, visible: false } : p));
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    if (navRect.height < 12 || itemRect.height < 12) {
      this.activePill.update((p) => (p.visible ? { ...p, visible: false } : p));
      return;
    }
    const top = Math.round(itemRect.top - navRect.top + nav.scrollTop);
    const height = Math.round(itemRect.height);
    const prev = this.activePill();
    if (!prev.visible || prev.top !== top || prev.height !== height) {
      this.activePill.set({ top, height, visible: true });
      this.cdr.markForCheck();
    }
  }
}

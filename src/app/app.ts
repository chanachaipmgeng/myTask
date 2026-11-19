import { AfterViewInit, ChangeDetectionStrategy, Component, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { AppBarModule, SidebarModule, TreeViewModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule, ToastComponent, ToastModule } from '@syncfusion/ej2-angular-notifications';
import { DialogComponent, DialogModule } from '@syncfusion/ej2-angular-popups';
import { NodeClickEventArgs, NodeSelectEventArgs } from '@syncfusion/ej2-navigations';
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
import { SectionCardComponent } from './shared/ui';

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
    TreeViewModule,
    ToastModule,
    ButtonModule,
    MessageModule,
    DialogModule,
    TextBoxModule,
    SectionCardComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly notice = inject(ShellNotice);
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient);
  protected readonly theme = inject(ThemeService);

  @ViewChild('toast') private toast?: ToastComponent;
  @ViewChild('alertDialog') private alertDialog?: DialogComponent;

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
  protected readonly toastPosition = { X: 'Right', Y: 'Top' };
  protected readonly menuSearch = signal('');
  protected onMenuSearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.menuSearch.set(target?.value ?? '');
  }
  protected clearMenuSearch(): void {
    this.menuSearch.set('');
  }

  protected readonly visibleNavGroups = computed<NavGroup[]>(() => {
    const role = this.role();
    const query = this.menuSearch().trim().toLowerCase();
    return allNavGroups
      .filter((group) => !group.roles || group.roles.includes(role))
      .map((group) => ({
        ...group,
        children: group.children.filter(
          (leaf) =>
            (!leaf.roles || leaf.roles.includes(role)) &&
            (!query || leaf.text.toLowerCase().includes(query) || group.text.toLowerCase().includes(query)),
        ),
      }))
      .filter((group) => group.children.length > 0);
  });

  protected readonly activeNavCategory = computed<'cockpit' | 'work' | 'quality' | 'analytics' | 'admin'>(() => {
    const path = this.url().split('?')[0] || '/';
    if (path === '/cockpit' || path === '/team' || path === '/me/cockpit') {
      return 'cockpit';
    }
    if (
      path.startsWith('/work') ||
      path.startsWith('/me/work') ||
      path.startsWith('/queue') ||
      path.startsWith('/tickets') ||
      path.startsWith('/schedule') ||
      path.startsWith('/me/tickets') ||
      path.startsWith('/me/schedule') ||
      path === '/me'
    ) {
      return 'work';
    }
    if (
      path.startsWith('/quality') ||
      path.startsWith('/analytics/time-audit') ||
      path.startsWith('/tickets/disputes') ||
      path.startsWith('/me/time-audit') ||
      path.startsWith('/me/disputes')
    ) {
      return 'quality';
    }
    if (
      path.startsWith('/analytics') ||
      path.startsWith('/ai') ||
      path.startsWith('/people') ||
      path.startsWith('/mygit') ||
      path.startsWith('/me/analytics') ||
      path.startsWith('/me/ai') ||
      path.startsWith('/me/mygit')
    ) {
      return 'analytics';
    }
    return 'admin';
  });

  protected selectRailCategory(cat: 'cockpit' | 'work' | 'quality' | 'analytics' | 'admin'): void {
    if (this.collapsed()) {
      this.collapsed.set(false);
    }
    const isMember = this.role() === 'member';
    switch (cat) {
      case 'cockpit':
        void this.router.navigate([isMember ? '/me/cockpit' : '/cockpit']);
        break;
      case 'work':
        void this.router.navigate([isMember ? '/me/work' : '/work']);
        break;
      case 'quality':
        void this.router.navigate([isMember ? '/me/disputes' : '/quality/audit']);
        break;
      case 'analytics':
        void this.router.navigate([isMember ? '/me/analytics' : '/analytics']);
        break;
      case 'admin':
        if (this.role() === 'admin') {
          void this.router.navigate(['/admin']);
        } else {
          void this.router.navigate(['/login']);
        }
        break;
    }
  }
  protected readonly navFields = computed(() => ({
    dataSource: this.visibleNavGroups() as object[],
    id: 'id',
    text: 'text',
    child: 'children',
    iconCss: 'iconCss',
  }));
  protected readonly expandedNodes = [
    'mine-daily',
    'mine-analytics',
    'lead-plan',
    'lead-audit',
    'admin-gov',
  ];
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
    if (role === 'admin') return 'โหมดแอดมิน · Admin';
    if (role === 'lead') return 'โหมดบริหารทีม · Lead';
    return 'โหมดงานของฉัน · Member';
  });
  protected readonly roleBadgeTone = computed<'danger' | 'warning' | 'info'>(() => {
    const role = this.role();
    if (role === 'admin') return 'danger';
    if (role === 'lead') return 'warning';
    return 'info';
  });

  constructor() {
    const media = window.matchMedia('(max-width: 800px)');
    this.narrow.set(media.matches);
    this.navOpen.set(!media.matches);
    media.addEventListener('change', (event) => {
      this.narrow.set(event.matches);
      this.navOpen.set(!event.matches);
    });
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe((event) => {
      if (this.narrow()) {
        this.navOpen.set(false);
      }
      const path = event.urlAfterRedirects.split('?')[0] || '/';
      const actual = this.trueRole();
      if (path === '/me' || path.startsWith('/me/')) {
        if (this.role() !== 'member') {
          setWorkspaceMode('member');
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
          setWorkspaceMode('admin');
        }
      } else if (
        actual !== 'member' &&
        (path === '/team' ||
          path.startsWith('/work') ||
          path.startsWith('/queue') ||
          path.startsWith('/people') ||
          path.startsWith('/quality') ||
          path.startsWith('/analytics') ||
          path.startsWith('/tickets') ||
          path.startsWith('/schedule') ||
          path.startsWith('/mygit') ||
          path.startsWith('/ai'))
      ) {
        if (this.role() !== 'lead') {
          setWorkspaceMode('lead');
        }
      }
    });
    effect(() => {
      this.selectedNodes.set([matchNavId(this.url(), this.role())]);
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

  protected onNavSelecting(event: NodeSelectEventArgs): void {
    const id = String(event.nodeData?.['id'] ?? '');
    if (allNavGroups.some((group) => group.id === id)) {
      event.cancel = true;
    }
  }

  protected onNavClick(event: NodeClickEventArgs): void {
    const id = String(event.node?.getAttribute('data-uid') ?? '');
    const leaf = allNavLeaves.find((item) => item.id === id);
    if (!leaf) {
      return;
    }
    void this.router.navigateByUrl(leaf.route);
  }

  protected onNavSelect(event: NodeSelectEventArgs): void {
    if (!event.isInteracted) {
      return;
    }
    const id = String(event.nodeData?.['id'] ?? '');
    const leaf = allNavLeaves.find((item) => item.id === id);
    if (!leaf) {
      return;
    }
    void this.router.navigateByUrl(leaf.route);
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
    const next = setWorkspaceMode(mode);
    if (next === 'member') {
      this.notice.info('สลับเข้าสู่โหมด "งานของฉัน" (Member Workspace)');
      void this.router.navigate(['/me']);
    } else if (next === 'lead') {
      this.notice.info('สลับเข้าสู่โหมด "บริหารทีม" (Lead Command Center)');
      void this.router.navigate(['/team']);
    } else {
      this.notice.info('สลับเข้าสู่โหมด "แอดมิน" (Admin & Governance Console)');
      void this.router.navigate(['/admin']);
    }
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

  ngAfterViewInit(): void {
    this.notice.bind((payload) => {
      const type = payload.type ?? 'info';
      this.toast?.show({
        title: shellNoticeTitle(type, payload.title),
        content: payload.text,
        cssClass: shellNoticeCssClass(type),
      });
    });
  }
}

const allNavGroups: NavGroup[] = [
  // ==========================================
  // โหมดที่ 1: งานของฉัน (Member Workspace)
  // ==========================================
  {
    id: 'mine-daily',
    text: 'จัดการใบงานประจำวัน',
    expanded: true,
    roles: ['member'],
    children: [
      { id: 'me', text: 'ผลงาน & งานวันนี้', iconCss: 'e-icons e-user', route: '/me', exact: true },
      { id: 'my-cockpit', text: 'ค็อกพิทผลงานของฉัน (Bento)', iconCss: 'e-icons e-dashboard', route: '/me/cockpit' },
      { id: 'my-work', text: 'ฮับงานของฉัน (Board/Gantt)', iconCss: 'e-icons e-timeline-work-week', route: '/me/work' },
      { id: 'my-schedule', text: 'ปฏิทินงานของฉัน', iconCss: 'e-icons e-date-time', route: '/me/schedule' },
      { id: 'my-mygit', text: 'ซิงก์ MR ของฉัน', iconCss: 'e-icons e-refresh', route: '/me/mygit' },
      { id: 'my-ai', text: 'ติดตามงาน AI ของฉัน', iconCss: 'e-icons e-chart', route: '/me/ai' },
    ],
  },
  {
    id: 'mine-analytics',
    text: 'ผลงาน & วิเคราะห์ตัวเอง',
    expanded: true,
    roles: ['member'],
    children: [
      { id: 'my-analytics', text: 'วิเคราะห์ผลงานเชิงลึก (OLS)', iconCss: 'e-icons e-chart', route: '/me/analytics' },
      { id: 'my-tickets', text: 'ตารางคะแนนใบงานของฉัน', iconCss: 'e-icons e-table-1', route: '/me/tickets' },
      { id: 'my-time-audit', text: 'เช็กเวลา 3 ทางของฉัน', iconCss: 'e-icons e-clock', route: '/me/time-audit' },
      { id: 'my-disputes', text: 'อุทธรณ์คะแนนของฉัน', iconCss: 'e-icons e-edit', route: '/me/disputes' },
    ],
  },

  // ==========================================
  // โหมดที่ 2: บริหารทีม (Lead Command Center)
  // ==========================================
  {
    id: 'lead-plan',
    text: 'บริหารแผน & จ่ายงานทีม',
    expanded: true,
    roles: ['lead'],
    children: [
      { id: 'team-dash', text: 'แดชบอร์ดทีม', iconCss: 'e-icons e-home', route: '/team' },
      { id: 'team-cockpit', text: 'ห้องบัญชาการ Bento (Cockpit)', iconCss: 'e-icons e-dashboard', route: '/cockpit' },
      { id: 'queue', text: 'คิวงานใหม่ & จ่ายงาน', iconCss: 'e-icons e-list-unordered', route: '/queue' },
      { id: 'work-hub', text: 'ฮับบริหารงานทีม', iconCss: 'e-icons e-timeline-work-week', route: '/work' },
      { id: 'schedule', text: 'ปฏิทินทีม & วันลา', iconCss: 'e-icons e-date-time', route: '/schedule' },
      { id: 'work-handoff', text: 'ส่งต่อ & SLA ข้ามทีม', iconCss: 'e-icons e-clock', route: '/work/handoff' },
    ],
  },
  {
    id: 'lead-audit',
    text: 'ตรวจรับ & วิเคราะห์ทีม',
    expanded: true,
    roles: ['lead'],
    children: [
      { id: 'quality-audit', text: 'ตรวจรับคุณภาพ QA (DoD)', iconCss: 'e-icons e-check-box', route: '/quality/audit' },
      { id: 'disputes', text: 'ศูนย์อนุมัติอุทธรณ์ทีม', iconCss: 'e-icons e-edit', route: '/tickets/disputes' },
      { id: 'tickets', text: 'ตารางคะแนนใบงานทีม', iconCss: 'e-icons e-table-1', route: '/tickets' },
      { id: 'time-audit', text: 'ตรวจสอบเวลา 3 ทางทีม', iconCss: 'e-icons e-clock', route: '/analytics/time-audit' },
      { id: 'analytics', text: 'ศูนย์วิเคราะห์ & Coaching', iconCss: 'e-icons e-chart', route: '/analytics' },
      { id: 'people', text: 'รายชื่อและโปรไฟล์ลูกทีม', iconCss: 'e-icons e-people', route: '/people', exact: true },
      { id: 'mygit', text: 'ซิงก์ mygit (MR) ทีม', iconCss: 'e-icons e-refresh', route: '/mygit' },
      { id: 'ai', text: 'ติดตามงาน AI ทีม', iconCss: 'e-icons e-chart', route: '/ai' },
    ],
  },

  // ==========================================
  // โหมดที่ 3: แอดมิน (Admin & Governance Console)
  // ==========================================
  {
    id: 'admin-gov',
    text: 'การตั้งค่าระบบ & ธรรมาภิบาล',
    expanded: true,
    roles: ['admin'],
    children: [
      { id: 'admin-home', text: 'หลังบ้าน & สิทธิ์ผู้ใช้', iconCss: 'e-icons e-lock', route: '/admin', exact: true },
      { id: 'admin-cockpit', text: 'ห้องบัญชาการ Bento (Cockpit)', iconCss: 'e-icons e-dashboard', route: '/cockpit' },
      { id: 'integrations', text: 'เชื่อมต่อระบบ (Integrations)', iconCss: 'e-icons e-settings', route: '/integrations' },
      {
        id: 'snapshot-check',
        text: 'ตรวจสอบก่อนแช่แข็งคะแนน',
        iconCss: 'e-icons e-lock',
        route: '/admin/snapshot-check',
      },
      { id: 'rubrics', text: 'ทะเบียนเกณฑ์ (Rubrics)', iconCss: 'e-icons e-settings', route: '/admin/rubrics' },
      { id: 'teams', text: 'ตั้งค่าแจ้งเตือน Teams', iconCss: 'e-icons e-comment-show', route: '/teams' },
      { id: 'mockup', text: 'โหมดจำลองระบบ', iconCss: 'e-icons e-play', route: '/mockup' },
      { id: 'login', text: 'สลับบัญชีผู้ใช้', iconCss: 'e-icons e-user', route: '/login' },
    ],
  },
];

const allNavLeaves = allNavGroups.flatMap((group) => group.children);

function matchNavId(url: string, role: AccessRole = 'member'): string {
  const path = url.split('?')[0] || '/';
  if (path.startsWith('/me/work')) {
    return 'my-work';
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
    return role === 'member' ? 'my-analytics' : 'people';
  }
  // Match exact route first
  const exactHit = allNavLeaves.find((item) => path === item.route);
  if (exactHit) {
    return exactHit.id;
  }
  // Otherwise match longest route prefix first
  const prefixHits = allNavLeaves
    .filter((item) => !item.exact && path.startsWith(`${item.route}/`))
    .sort((a, b) => b.route.length - a.route.length);
  if (prefixHits[0]) {
    return prefixHits[0].id;
  }
  if (role === 'admin') return 'admin-home';
  if (role === 'lead') return 'team-dash';
  return 'me';
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
  if (url.startsWith('/work/handoff')) {
    return 'ตรวจสอบการส่งต่อ & SLA ข้ามทีม';
  }
  if (url.startsWith('/quality/audit')) {
    return 'ตรวจสอบคุณภาพ QA & Defect Audit';
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
    return 'ฮับงานของฉัน';
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
    return 'ฮับบริหารงานทีม';
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

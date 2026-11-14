import { AfterViewInit, ChangeDetectionStrategy, Component, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { AppBarModule, SidebarModule, TreeViewModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule, ToastComponent, ToastModule } from '@syncfusion/ej2-angular-notifications';
import { DialogComponent, DialogModule } from '@syncfusion/ej2-angular-popups';
import { NodeClickEventArgs, NodeSelectEventArgs } from '@syncfusion/ej2-navigations';
import { filter, map, startWith } from 'rxjs';
import {
  actualRole,
  currentViewer,
  effectiveRole,
  toggleViewAsMember,
  viewAsRole,
} from './core/admin-settings';
import { AccessRole } from './core/models';
import { ShellNotice } from './core/shell-notice';
import { ScorecardService } from './core/scorecard.service';
import { currentSession } from './core/session';

type NavLeaf = {
  id: string;
  text: string;
  iconCss: string;
  route: string;
  exact?: boolean;
  roles?: readonly AccessRole[];
};
type NavGroup = { id: string; text: string; expanded: boolean; children: NavLeaf[] };

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SidebarModule, AppBarModule, TreeViewModule, ToastModule, ButtonModule, MessageModule, DialogModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly notice = inject(ShellNotice);
  private readonly scorecard = inject(ScorecardService);

  @ViewChild('toast') private toast?: ToastComponent;
  @ViewChild('alertDialog') private alertDialog?: DialogComponent;

  protected readonly narrow = signal(false);
  protected readonly navOpen = signal(true);
  protected readonly alerts = this.scorecard.alerts;
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
  protected readonly toastPosition = { X: 'Right', Y: 'Top' };
  protected readonly visibleNavGroups = computed<NavGroup[]>(() => {
    const role = this.role();
    return allNavGroups
      .map((group) => ({
        ...group,
        children: group.children.filter((leaf) => !leaf.roles || leaf.roles.includes(role)),
      }))
      .filter((group) => group.children.length > 0);
  });
  protected readonly navFields = computed(() => ({
    dataSource: this.visibleNavGroups() as object[],
    id: 'id',
    text: 'text',
    child: 'children',
    iconCss: 'iconCss',
  }));
  protected readonly expandedNodes = ['personal', 'overview', 'work', 'connect', 'system'];
  protected readonly selectedNodes = signal<string[]>(['team']);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );
  protected readonly title = computed(() => screenTitle(this.url()));

  constructor() {
    const media = window.matchMedia('(max-width: 800px)');
    this.narrow.set(media.matches);
    this.navOpen.set(!media.matches);
    media.addEventListener('change', (event) => {
      this.narrow.set(event.matches);
      this.navOpen.set(!event.matches);
    });
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      if (this.narrow()) {
        this.navOpen.set(false);
      }
    });
    effect(() => {
      this.selectedNodes.set([matchNavId(this.url())]);
    });
  }

  protected toggleNav(): void {
    this.navOpen.update((open) => !open);
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
    void this.router.navigate(['/work/board']);
  }

  protected goToTicketScores(): void {
    this.alertDialog?.hide();
    void this.router.navigate(['/tickets']);
  }

  protected openMyWorkspace(): void {
    void this.router.navigate(['/me']);
  }

  protected openLogin(): void {
    void this.router.navigate(['/login']);
  }

  protected togglePersonaPreview(): void {
    const next = toggleViewAsMember();
    if (next === 'member') {
      this.notice.show('สลับเป็นมุมมองพนักงานทั่วไป (Member View) — ซ่อนเมนูตั้งค่าระบบ');
      void this.router.navigate(['/me']);
    } else {
      this.notice.show(`กลับสู่มุมมอง ${next} ตามสิทธิ์จริง`);
    }
  }

  ngAfterViewInit(): void {
    this.notice.bind((text) => {
      this.toast?.show({ title: 'คะแนนใบงาน', content: text });
    });
  }
}

const allNavGroups: NavGroup[] = [
  {
    id: 'personal',
    text: 'พื้นที่ของฉัน',
    expanded: true,
    children: [
      { id: 'me', text: 'งานและพัฒนาการของฉัน', iconCss: 'e-icons e-user', route: '/me' },
    ],
  },
  {
    id: 'overview',
    text: 'ภาพรวมและวิเคราะห์',
    expanded: true,
    children: [
      { id: 'team', text: 'แดชบอร์ดทีม', iconCss: 'e-icons e-home', route: '/team' },
      {
        id: 'analytics',
        text: 'ศูนย์วิเคราะห์ Python',
        iconCss: 'e-icons e-chart',
        route: '/analytics',
        roles: ['admin', 'lead'],
      },
      {
        id: 'people',
        text: 'รายชื่อพนักงาน',
        iconCss: 'e-icons e-people',
        route: '/people',
        exact: true,
        roles: ['admin', 'lead'],
      },
      { id: 'ai', text: 'ติดตามงาน AI', iconCss: 'e-icons e-chart', route: '/ai' },
    ],
  },
  {
    id: 'work',
    text: 'งานและการส่งมอบ',
    expanded: true,
    children: [
      { id: 'work-hub', text: 'ฮับบริหารงาน', iconCss: 'e-icons e-timeline-work-week', route: '/work' },
      { id: 'tickets', text: 'ตารางคะแนนใบงาน', iconCss: 'e-icons e-table-1', route: '/tickets' },
      { id: 'schedule', text: 'ปฏิทินทีม', iconCss: 'e-icons e-date-time', route: '/schedule' },
      {
        id: 'queue',
        text: 'คิวงานใหม่',
        iconCss: 'e-icons e-list-unordered',
        route: '/queue',
        roles: ['admin', 'lead'],
      },
    ],
  },
  {
    id: 'connect',
    text: 'ศูนย์ซิงก์ข้อมูล',
    expanded: true,
    children: [
      { id: 'mygit', text: 'ซิงก์ mygit (MR)', iconCss: 'e-icons e-refresh', route: '/mygit' },
      {
        id: 'teams',
        text: 'แจ้งเตือน Teams',
        iconCss: 'e-icons e-comment-show',
        route: '/teams',
        roles: ['admin', 'lead'],
      },
      {
        id: 'integrations',
        text: 'Integrations',
        iconCss: 'e-icons e-settings',
        route: '/integrations',
        roles: ['admin', 'lead'],
      },
    ],
  },
  {
    id: 'system',
    text: 'ระบบและสิทธิ์ผู้ใช้',
    expanded: true,
    children: [
      { id: 'login', text: 'เข้าสู่ระบบ / สลับบัญชี', iconCss: 'e-icons e-user', route: '/login' },
      { id: 'mockup', text: 'โหมดจำลอง', iconCss: 'e-icons e-play', route: '/mockup' },
      {
        id: 'admin',
        text: 'หลังบ้าน & สิทธิ์',
        iconCss: 'e-icons e-lock',
        route: '/admin',
        roles: ['admin', 'lead'],
      },
    ],
  },
];

const allNavLeaves = allNavGroups.flatMap((group) => group.children);

function matchNavId(url: string): string {
  const path = url.split('?')[0] || '/';
  if (path.startsWith('/people/') && path !== '/people') {
    return 'people';
  }
  const hit = allNavLeaves.find((item) => {
    if (item.exact) {
      return path === item.route;
    }
    return path === item.route || path.startsWith(`${item.route}/`);
  });
  return hit?.id ?? 'team';
}

function screenTitle(url: string): string {
  if (url.startsWith('/me')) {
    return 'พื้นที่ของฉัน';
  }
  if (url.startsWith('/login')) {
    return 'เข้าสู่ระบบ & สลับบทบาท';
  }
  if (url.startsWith('/analytics')) {
    return 'ศูนย์วิเคราะห์ข้อมูล Python';
  }
  if (url.startsWith('/people/')) {
    return 'โปรไฟล์พนักงาน';
  }
  if (url.startsWith('/people')) {
    return 'รายชื่อพนักงาน';
  }
  if (url.startsWith('/work')) {
    return 'ฮับบริหารงาน';
  }
  if (url.startsWith('/tickets')) {
    return 'ตารางคะแนนใบงาน';
  }
  if (url.startsWith('/schedule')) {
    return 'ปฏิทินทีม';
  }
  if (url.startsWith('/queue')) {
    return 'คิวงานใหม่';
  }
  if (url.startsWith('/mygit')) {
    return 'ซิงก์ mygit';
  }
  if (url.startsWith('/teams')) {
    return 'แจ้งเตือน Teams';
  }
  if (url.startsWith('/ai')) {
    return 'ติดตามงาน AI';
  }
  if (url.startsWith('/integrations')) {
    return 'Integrations';
  }
  if (url.startsWith('/admin')) {
    return 'หลังบ้าน & สิทธิ์';
  }
  if (url.startsWith('/mockup')) {
    return 'โหมดจำลอง';
  }
  return 'แดชบอร์ดทีม';
}

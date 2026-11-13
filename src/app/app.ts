import { AfterViewInit, Component, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { AppBarModule, SidebarModule, TreeViewModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule, ToastComponent, ToastModule } from '@syncfusion/ej2-angular-notifications';
import { NodeClickEventArgs, NodeSelectEventArgs } from '@syncfusion/ej2-navigations';
import { filter, map, startWith } from 'rxjs';
import { ShellNotice } from './core/shell-notice';
import { ScorecardService } from './core/scorecard.service';

type NavLeaf = { id: string; text: string; iconCss: string; route: string; exact?: boolean };
type NavGroup = { id: string; text: string; expanded: boolean; children: NavLeaf[] };

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SidebarModule, AppBarModule, TreeViewModule, ToastModule, ButtonModule, MessageModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly notice = inject(ShellNotice);
  private readonly scorecard = inject(ScorecardService);

  @ViewChild('toast') private toast?: ToastComponent;

  protected readonly narrow = signal(false);
  protected readonly navOpen = signal(true);
  protected readonly alerts = this.scorecard.alerts;
  protected readonly mockMode = this.scorecard.mockMode;
  protected readonly toastPosition = { X: 'Right', Y: 'Top' };
  protected readonly navFields = {
    dataSource: navGroups as object[],
    id: 'id',
    text: 'text',
    child: 'children',
    iconCss: 'iconCss',
  };
  protected readonly expandedNodes = ['overview', 'work', 'connect', 'system'];
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
    if (navGroups.some((group) => group.id === id)) {
      event.cancel = true;
    }
  }

  protected onNavClick(event: NodeClickEventArgs): void {
    const id = String(event.node?.getAttribute('data-uid') ?? '');
    const leaf = navLeaves.find((item) => item.id === id);
    if (!leaf) {
      return;
    }
    void this.router.navigateByUrl(leaf.route);
  }

  protected onNavSelect(event: NodeSelectEventArgs): void {
    const id = String(event.nodeData?.['id'] ?? '');
    const leaf = navLeaves.find((item) => item.id === id);
    if (!leaf) {
      return;
    }
    void this.router.navigateByUrl(leaf.route);
  }

  ngAfterViewInit(): void {
    this.notice.bind((text) => {
      this.toast?.show({ title: 'คะแนนใบงาน', content: text });
    });
  }
}

const navGroups: NavGroup[] = [
  {
    id: 'overview',
    text: 'ภาพรวม',
    expanded: true,
    children: [
      { id: 'team', text: 'แดชบอร์ดทีม', iconCss: 'e-icons e-home', route: '/team' },
      { id: 'people', text: 'รายชื่อพนักงาน', iconCss: 'e-icons e-people', route: '/people', exact: true },
      { id: 'person-itsara', text: 'พนักงาน · อิสรภาพ', iconCss: 'e-icons e-user', route: '/people/itsara' },
    ],
  },
  {
    id: 'work',
    text: 'งาน',
    expanded: true,
    children: [
      { id: 'work-hub', text: 'งาน', iconCss: 'e-icons e-timeline-work-week', route: '/work' },
      { id: 'tickets', text: 'ใบงาน', iconCss: 'e-icons e-table-1', route: '/tickets' },
      { id: 'schedule', text: 'ปฏิทินทีม', iconCss: 'e-icons e-date-time', route: '/schedule' },
      { id: 'queue', text: 'คิวงานใหม่', iconCss: 'e-icons e-list-unordered', route: '/queue' },
      { id: 'ai', text: 'ติดตามงาน AI', iconCss: 'e-icons e-chart', route: '/ai' },
    ],
  },
  {
    id: 'connect',
    text: 'เชื่อมต่อ',
    expanded: true,
    children: [
      { id: 'mygit', text: 'ซิงก์ mygit', iconCss: 'e-icons e-refresh', route: '/mygit' },
      { id: 'teams', text: 'แจ้งเตือน Teams', iconCss: 'e-icons e-comment-show', route: '/teams' },
      { id: 'integrations', text: 'Integrations', iconCss: 'e-icons e-settings', route: '/integrations' },
    ],
  },
  {
    id: 'system',
    text: 'ระบบ',
    expanded: true,
    children: [
      { id: 'mockup', text: 'โหมดจำลอง', iconCss: 'e-icons e-play', route: '/mockup' },
      { id: 'admin', text: 'หลังบ้าน', iconCss: 'e-icons e-lock', route: '/admin' },
    ],
  },
];

const navLeaves = navGroups.flatMap((group) => group.children);

function matchNavId(url: string): string {
  const path = url.split('?')[0] || '/';
  if (path.startsWith('/people/itsara')) {
    return 'person-itsara';
  }
  if (path.startsWith('/people/') && path !== '/people') {
    return 'people';
  }
  const hit = navLeaves.find((item) => {
    if (item.exact) {
      return path === item.route;
    }
    return path === item.route || path.startsWith(`${item.route}/`);
  });
  return hit?.id ?? 'team';
}

function screenTitle(url: string): string {
  if (url.startsWith('/people/')) {
    return 'โปรไฟล์พนักงาน';
  }
  if (url.startsWith('/people')) {
    return 'รายชื่อพนักงาน';
  }
  if (url.startsWith('/work')) {
    return 'งาน';
  }
  if (url.startsWith('/tickets')) {
    return 'ใบงาน';
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
    return 'หลังบ้าน';
  }
  if (url.startsWith('/mockup')) {
    return 'โหมดจำลอง';
  }
  return 'แดชบอร์ดทีม';
}

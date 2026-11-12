import { AfterViewInit, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { AppBarModule, SidebarModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule, ToastComponent, ToastModule } from '@syncfusion/ej2-angular-notifications';
import { filter, map, startWith } from 'rxjs';
import { ShellNotice } from './core/shell-notice';
import { ScorecardService } from './core/scorecard.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SidebarModule, AppBarModule, ToastModule, ButtonModule, MessageModule],
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
  protected readonly toastPosition = { X: 'Right', Y: 'Top' };
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
  }

  protected toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  protected onNavClose(): void {
    if (this.narrow()) {
      this.navOpen.set(false);
    }
  }

  ngAfterViewInit(): void {
    this.notice.bind((text) => {
      this.toast?.show({ title: 'คะแนนใบงาน', content: text });
    });
  }
}

function screenTitle(url: string): string {
  if (url.startsWith('/people/')) {
    return 'แดชบอร์ดรายคน';
  }
  if (url.startsWith('/people')) {
    return 'กระดานรายคน';
  }
  if (url.startsWith('/tickets')) {
    return 'ใบงาน';
  }
  if (url.startsWith('/pipeline')) {
    return 'สถานะงาน';
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
  if (url.startsWith('/admin')) {
    return 'หลังบ้าน';
  }
  return 'แดชบอร์ดทีม';
}

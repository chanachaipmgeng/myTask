import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { effectiveRole } from '../../core/admin-settings';

const ALL_INSIGHTS_TABS = [
  { text: 'ศูนย์วิเคราะห์ทีม', path: 'report', icon: 'e-icons e-chart', managerOnly: true },
  { text: 'วิเคราะห์รายคน (OLS)', path: 'ols', icon: 'e-icons e-user', managerOnly: false },
  { text: 'MR / mygit', path: 'mygit', icon: 'e-icons e-refresh', managerOnly: false },
  { text: 'งาน AI & Spike', path: 'ai', icon: 'e-icons e-chart', managerOnly: false },
  { text: 'โหมดจำลอง', path: 'mockup', icon: 'e-icons e-play', managerOnly: true },
] as const;

@Component({
  selector: 'app-insights-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './hub-shell.html',
  styleUrl: './hub-shell.scss',
})
export class InsightsShell {
  private readonly router = inject(Router);
  protected readonly basePath = '/insights';
  protected readonly heading = computed(() =>
    effectiveRole() === 'member' ? 'วิเคราะห์ & Git MR ของฉัน' : 'วิเคราะห์ & ซิงก์ทีม',
  );
  protected readonly tabs = computed(() =>
    effectiveRole() === 'member'
      ? ALL_INSIGHTS_TABS.filter((tab) => !tab.managerOnly)
      : ALL_INSIGHTS_TABS,
  );
  protected readonly showTabs = computed(() => true);

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
    const list = this.tabs();
    const found = list.find(
      (tab) => path === `${this.basePath}/${tab.path}` || path.startsWith(`${this.basePath}/${tab.path}/`),
    );
    return found?.path ?? (effectiveRole() === 'member' ? 'ols' : 'report');
  });

  constructor() {
    effect(() => {
      const role = effectiveRole();
      const path = this.url().split('?')[0] ?? '';
      if (role === 'member' && (path.startsWith('/insights/report') || path.startsWith('/insights/mockup'))) {
        void this.router.navigate(['/insights/ols'], { queryParamsHandling: 'preserve', replaceUrl: true });
      }
    });
  }

  protected tabLink(path: string): string[] {
    return [this.basePath, path];
  }
}

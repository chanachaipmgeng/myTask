import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

const INSIGHTS_TABS = [
  { text: 'ศูนย์วิเคราะห์', path: 'report', icon: 'e-icons e-chart' },
  { text: 'MR / mygit', path: 'mygit', icon: 'e-icons e-refresh' },
  { text: 'AI', path: 'ai', icon: 'e-icons e-chart' },
  { text: 'จำลอง', path: 'mockup', icon: 'e-icons e-play' },
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
  protected readonly heading = 'วิเคราะห์ & ซิงก์ทีม';
  protected readonly basePath = '/insights';
  protected readonly tabs = INSIGHTS_TABS;
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
    const found = this.tabs.find(
      (tab) => path === `${this.basePath}/${tab.path}` || path.startsWith(`${this.basePath}/${tab.path}/`),
    );
    return found?.path ?? 'report';
  });

  protected tabLink(path: string): string[] {
    return [this.basePath, path];
  }
}

import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { effectiveRole } from '../../core/admin-settings';

const ALL_QUALITY_TABS = [
  { text: 'QA / DoD', path: 'audit', icon: 'e-icons e-check-box', managerOnly: true },
  { text: 'ตารางคะแนน', path: 'tickets', icon: 'e-icons e-table', managerOnly: false },
  { text: 'เวลา 3 ทาง', path: 'time-audit', icon: 'e-icons e-clock', managerOnly: false },
  { text: 'อุทธรณ์คะแนน', path: 'disputes', icon: 'e-icons e-edit', managerOnly: false },
] as const;

@Component({
  selector: 'app-quality-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './hub-shell.html',
  styleUrl: './hub-shell.scss',
})
export class QualityShell {
  private readonly router = inject(Router);
  protected readonly basePath = '/quality';
  protected readonly heading = computed(() =>
    effectiveRole() === 'member' ? 'คะแนน & อุทธรณ์ของฉัน' : 'คุณภาพ & คะแนนทีม',
  );
  protected readonly tabs = computed(() =>
    effectiveRole() === 'member'
      ? ALL_QUALITY_TABS.filter((tab) => !tab.managerOnly)
      : ALL_QUALITY_TABS,
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
    return found?.path ?? (effectiveRole() === 'member' ? 'tickets' : 'audit');
  });

  constructor() {
    effect(() => {
      const role = effectiveRole();
      const path = this.url().split('?')[0] ?? '';
      if (role === 'member' && path.startsWith('/quality/audit')) {
        void this.router.navigate(['/quality/tickets'], { queryParamsHandling: 'preserve', replaceUrl: true });
      }
    });
  }

  protected tabLink(path: string): string[] {
    return [this.basePath, path];
  }
}

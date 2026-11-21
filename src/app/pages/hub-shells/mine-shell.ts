import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { effectiveRole } from '../../core/admin-settings';

/** แท็บหลัก 6 ชุด (แสดงเฉพาะตอน Lead/Admin เข้ามาดูพื้นที่ของฉัน — Member ใช้ Sidebar ตรงแทน) */
const MINE_TABS = [
  { text: 'วันนี้', path: '', icon: 'e-icons e-user' },
  { text: 'ค็อกพิท', path: 'cockpit', icon: 'e-icons e-grid-view' },
  { text: 'งาน', path: 'work', icon: 'e-icons e-timeline-work-week' },
  { text: 'ปฏิทิน', path: 'schedule', icon: 'e-icons e-timeline-today' },
  { text: 'คะแนน', path: 'tickets', icon: 'e-icons e-table' },
  { text: 'วิเคราะห์', path: 'analytics', icon: 'e-icons e-chart' },
] as const;

@Component({
  selector: 'app-mine-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './hub-shell.html',
  styleUrl: './hub-shell.scss',
})
export class MineShell {
  private readonly router = inject(Router);
  protected readonly heading = 'ของฉัน';
  protected readonly basePath = '/me';
  protected readonly tabs = MINE_TABS;
  protected readonly showTabs = computed(() => effectiveRole() !== 'member');

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly activePath = computed(() => {
    const path = (this.url().split('?')[0] ?? '').replace(/\/$/, '') || '/me';
    if (path === '/me') {
      return '';
    }
    const found = this.tabs.find(
      (tab) => tab.path && (path === `${this.basePath}/${tab.path}` || path.startsWith(`${this.basePath}/${tab.path}/`)),
    );
    return found?.path ?? '';
  });

  protected tabLink(path: string): string[] {
    return path ? [this.basePath, path] : [this.basePath];
  }
}

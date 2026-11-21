import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { filter, map, startWith } from 'rxjs';

const QUALITY_TABS = [
  { text: 'QA / DoD', path: 'audit', icon: 'e-icons e-check-box' },
  { text: 'คะแนน', path: 'tickets', icon: 'e-icons e-table' },
  { text: 'เวลา 3 ทาง', path: 'time-audit', icon: 'e-icons e-clock' },
  { text: 'อุทธรณ์', path: 'disputes', icon: 'e-icons e-edit' },
] as const;

@Component({
  selector: 'app-quality-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule],
  templateUrl: './hub-shell.html',
  styleUrl: './hub-shell.scss',
})
export class QualityShell {
  private readonly router = inject(Router);
  protected readonly heading = 'คุณภาพ & คะแนนทีม';
  protected readonly basePath = '/quality';
  protected readonly tabs = QUALITY_TABS;

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
    return found?.path ?? 'audit';
  });

  protected tabLink(path: string): string[] {
    return [this.basePath, path];
  }
}

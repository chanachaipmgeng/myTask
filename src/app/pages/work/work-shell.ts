import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { filter, map, startWith } from 'rxjs';
import { WorkHubFilter } from './work-hub-filter';

const TABS = [
  { text: 'Summary', path: 'summary' },
  { text: 'Timeline', path: 'timeline' },
  { text: 'Backlog', path: 'backlog' },
  { text: 'Board', path: 'board' },
  { text: 'List', path: 'list' },
] as const;

@Component({
  selector: 'app-work-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, DropDownListModule, TextBoxModule],
  providers: [WorkHubFilter],
  templateUrl: './work-shell.html',
})
export class WorkShell {
  private readonly router = inject(Router);
  protected readonly filter = inject(WorkHubFilter);

  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly trackOptions = [
    { text: 'ทั้งหมด', value: 'All' },
    { text: 'Implement', value: 'Implement' },
    { text: 'R&D', value: 'RD' },
  ];
  protected readonly tabs = TABS;

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
    const found = TABS.find((tab) => path.endsWith(`/work/${tab.path}`) || path.includes(`/work/${tab.path}`));
    return found?.path ?? 'summary';
  });

  protected setTrack(event: { value?: string | null }): void {
    const value = event.value;
    if (value === 'All' || value === 'Implement' || value === 'RD') {
      this.filter.track.set(value);
    }
  }

  protected setQuery(event: { value?: string }): void {
    this.filter.query.set(event.value ?? '');
  }
}

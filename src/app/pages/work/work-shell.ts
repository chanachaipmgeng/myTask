import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { TabModule } from '@syncfusion/ej2-angular-navigations';
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
  imports: [RouterOutlet, TabModule, DropDownListModule, TextBoxModule],
  providers: [WorkHubFilter],
  templateUrl: './work-shell.html',
})
export class WorkShell {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly filter = inject(WorkHubFilter);

  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly trackOptions = [
    { text: 'ทั้งหมด', value: 'All' },
    { text: 'Implement', value: 'Implement' },
    { text: 'R&D', value: 'RD' },
  ];
  protected readonly tabItems = TABS.map((tab) => ({ header: { text: tab.text }, content: '' }));

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly selectedTab = computed(() => {
    const path = this.url().split('?')[0] ?? '';
    const index = TABS.findIndex((tab) => path.endsWith(`/work/${tab.path}`) || path.includes(`/work/${tab.path}`));
    return index >= 0 ? index : 0;
  });

  protected onTabSelected(event: { selectedIndex?: number }): void {
    const index = event.selectedIndex ?? 0;
    const tab = TABS[index];
    if (!tab) {
      return;
    }
    void this.router.navigate([tab.path], { relativeTo: this.route });
  }

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

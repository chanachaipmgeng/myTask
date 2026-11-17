import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { filter, map, startWith } from 'rxjs';
import { FilterChipOption, FilterChipsComponent } from '../../shared/ui/filter-chips/filter-chips';
import { FormFieldComponent } from '../../shared/ui/form-field/form-field';
import { WorkHubFilter } from './work-hub-filter';

const TABS = [
  { text: 'Summary', path: 'summary', icon: 'e-icons e-chart' },
  { text: 'Timeline', path: 'timeline', icon: 'e-icons e-timeline-work-week' },
  { text: 'Backlog', path: 'backlog', icon: 'e-icons e-list-unordered' },
  { text: 'Board', path: 'board', icon: 'e-icons e-kanban' },
  { text: 'List', path: 'list', icon: 'e-icons e-table' },
  { text: 'Handoff & SLA', path: 'handoff', icon: 'e-icons e-clock' },
] as const;

@Component({
  selector: 'app-work-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    TextBoxModule,
    FilterChipsComponent,
    FormFieldComponent,
  ],
  providers: [WorkHubFilter],
  templateUrl: './work-shell.html',
})
export class WorkShell {
  private readonly router = inject(Router);
  protected readonly filter = inject(WorkHubFilter);

  protected readonly trackChipOptions: FilterChipOption[] = [
    { id: 'All', label: 'ทั้งหมด' },
    { id: 'Implement', label: 'Implement' },
    { id: 'RD', label: 'R&D' },
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

  protected setTrackChip(value: string): void {
    if (value === 'All' || value === 'Implement' || value === 'RD') {
      this.filter.track.set(value);
    }
  }

  protected setQuery(event: { value?: string }): void {
    this.filter.query.set(event.value ?? '');
  }
}

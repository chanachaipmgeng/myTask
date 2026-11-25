import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { filter, map, startWith } from 'rxjs';
import { listTeamWorkspaceCards } from '../../../../shared/domain/workspace-scope';
import { ScorecardService } from '../../core/scorecard.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';

const TEAM_WS_TABS = [
  { text: 'คน', path: 'people', icon: 'e-icons e-people', absolute: '/workspace/people' },
  { text: 'งาน', path: 'work', icon: 'e-icons e-timeline-work-week', absolute: '' },
  { text: 'คะแนน', path: 'tickets', icon: 'e-icons e-table', absolute: '' },
  { text: 'ภาพรวม', path: 'cockpit', icon: 'e-icons e-grid-view', absolute: '' },
] as const;

@Component({
  selector: 'app-team-workspace-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, PageHeadComponent],
  templateUrl: './team-workspace-shell.html',
  styleUrl: './team-workspace-shell.scss',
})
export class TeamWorkspaceShell {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scorecard = inject(ScorecardService);
  private readonly workspace = inject(WorkspaceFilter);

  protected readonly tabs = TEAM_WS_TABS;

  private readonly teamIdParam = toSignal(
    this.route.paramMap.pipe(map((params) => (params.get('teamId') ?? '').trim())),
    { initialValue: (this.route.snapshot.paramMap.get('teamId') ?? '').trim() },
  );

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly teamId = computed(() => this.teamIdParam());

  protected readonly card = computed(() => {
    const id = this.teamId();
    return listTeamWorkspaceCards(this.scorecard.people(), this.scorecard.teams()).find((row) => row.id === id) ?? null;
  });

  protected readonly heading = computed(() => this.card()?.name || this.teamId() || 'ทีม');

  protected readonly basePath = computed(() => `/org/teams/${this.teamId()}`);

  protected readonly activePath = computed(() => {
    const path = this.url().split('?')[0] ?? '';
    const base = this.basePath();
    const found = this.tabs.find(
      (tab) => path === `${base}/${tab.path}` || path.startsWith(`${base}/${tab.path}/`),
    );
    return found?.path ?? 'people';
  });

  protected readonly openTicketCount = computed(() => {
    const tickets = this.workspace.applyToTickets(this.scorecard.tickets());
    return tickets.filter((ticket) => !ticket.closed).length;
  });

  constructor() {
    effect(() => {
      const id = this.teamId();
      if (id && this.workspace.teamId() !== id) {
        this.workspace.setTeam(id);
      }
    });
  }

  protected tabRouterLink(tab: (typeof TEAM_WS_TABS)[number]): string | string[] {
    return tab.absolute || [this.basePath(), tab.path];
  }

  protected backToHub(): void {
    void this.workspace.navigateWithFilter(['/org/teams']);
  }

  protected clearTeam(): void {
    this.workspace.setTeam('');
    void this.workspace.navigateWithFilter(['/org/teams']);
  }
}

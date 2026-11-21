import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { listTeamWorkspaceCards } from '../../../../shared/domain/workspace-scope';
import { ScorecardService } from '../../core/scorecard.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';

@Component({
  selector: 'app-org-teams-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, PageHeadComponent, SectionCardComponent],
  templateUrl: './org-teams-hub.html',
  styleUrl: './org-teams-hub.scss',
})
export class OrgTeamsHubPage {
  private readonly scorecard = inject(ScorecardService);
  protected readonly workspace = inject(WorkspaceFilter);

  protected readonly cards = computed(() =>
    listTeamWorkspaceCards(this.scorecard.people(), this.scorecard.teams()),
  );

  protected readonly totalMembers = computed(() =>
    this.cards().reduce((sum, card) => sum + card.memberCount, 0),
  );

  protected openTeam(teamId: string): void {
    this.workspace.setTeam(teamId);
    void this.workspace.navigateWithFilter(['/workspace/people']);
  }

  protected clearTeam(): void {
    this.workspace.setTeam('');
  }
}

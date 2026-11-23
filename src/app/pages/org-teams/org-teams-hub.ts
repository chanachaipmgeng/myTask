import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { listTeamWorkspaceCards } from '../../../../shared/domain/workspace-scope';
import { resolvePersonTeamId } from '../../../../shared/domain/work-views';
import { Person } from '../../core/models';
import { ScorecardService } from '../../core/scorecard.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { PersonAvatarComponent } from '../../shared/ui/person-avatar/person-avatar';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';
import { SfTextBoxComponent } from '../../shared/ui';

@Component({
  selector: 'app-org-teams-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, PageHeadComponent, PersonAvatarComponent, SectionCardComponent, SfTextBoxComponent],
  templateUrl: './org-teams-hub.html',
  styleUrl: './org-teams-hub.scss',
})
export class OrgTeamsHubPage {
  private readonly scorecard = inject(ScorecardService);
  protected readonly workspace = inject(WorkspaceFilter);
  protected readonly query = signal('');

  protected readonly cards = computed(() => {
    const all = listTeamWorkspaceCards(this.scorecard.people(), this.scorecard.teams());
    const q = this.query().trim().toLowerCase();
    if (!q) {
      return all;
    }
    return all.filter(
      (card) =>
        card.name.toLowerCase().includes(q) ||
        card.trackSummary.toLowerCase().includes(q) ||
        card.leadName.toLowerCase().includes(q) ||
        card.id.toLowerCase().includes(q),
    );
  });

  protected readonly totalMembers = computed(() =>
    this.cards().reduce((sum, card) => sum + card.memberCount, 0),
  );

  protected teamMembersPreview(teamId: string): Person[] {
    return this.scorecard
      .people()
      .filter((p) => p.active !== false && resolvePersonTeamId(p) === teamId)
      .slice(0, 6);
  }

  protected openTeam(teamId: string): void {
    this.workspace.setTeam(teamId);
    void this.workspace.navigateWithFilter(['/workspace/people']);
  }

  protected clearTeam(): void {
    this.workspace.setTeam('');
  }
}

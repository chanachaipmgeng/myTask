import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { FilterService, GridModule, PageService, SortService } from '@syncfusion/ej2-angular-grids';
import { ScorecardService } from '../../core/scorecard.service';
import { workBacklogRows } from '../../core/work-views';
import { WorkHubFilter } from './work-hub-filter';

@Component({
  selector: 'app-work-backlog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GridModule, ButtonModule, RouterLink],
  providers: [PageService, SortService, FilterService],
  templateUrl: './work-backlog.html',
})
export class WorkBacklog {
  private readonly scorecard = inject(ScorecardService);
  private readonly hub = inject(WorkHubFilter);

  protected readonly pageSettings = { pageSize: 12 };
  protected readonly rows = computed(() =>
    workBacklogRows(this.scorecard.tickets(), this.scorecard.people(), {
      track: this.hub.track(),
      query: this.hub.query(),
    }),
  );
}

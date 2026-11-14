import { ChangeDetectionStrategy, Component, ViewChild, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  AggregateService,
  ColumnChooserService,
  ExcelExportService,
  FilterService,
  GridComponent,
  GridModule,
  PageService,
  ResizeService,
  SortService,
  ToolbarService,
} from '@syncfusion/ej2-angular-grids';
import { ScorecardService } from '../../core/scorecard.service';
import { workBacklogRows } from '../../core/work-views';
import { WorkHubFilter } from './work-hub-filter';

@Component({
  selector: 'app-work-backlog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GridModule, ButtonModule, RouterLink],
  providers: [
    PageService,
    SortService,
    FilterService,
    ResizeService,
    ColumnChooserService,
    ExcelExportService,
    AggregateService,
    ToolbarService,
  ],
  templateUrl: './work-backlog.html',
})
export class WorkBacklog {
  private readonly scorecard = inject(ScorecardService);
  private readonly hub = inject(WorkHubFilter);

  @ViewChild('backlogGrid') private backlogGrid?: GridComponent;

  protected readonly pageSettings = { pageSize: 12 };
  protected readonly gridToolbar = ['ColumnChooser', 'ExcelExport', 'CsvExport'];
  protected readonly rows = computed(() =>
    workBacklogRows(this.scorecard.tickets(), this.scorecard.people(), {
      track: this.hub.track(),
      query: this.hub.query(),
    }),
  );

  protected onToolbarClick(args: { item?: { id?: string } }): void {
    const id = args.item?.id ?? '';
    if (id.endsWith('_excelexport')) {
      void this.backlogGrid?.excelExport();
    } else if (id.endsWith('_csvexport')) {
      void this.backlogGrid?.csvExport();
    }
  }
}

import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
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
import { DialogComponent, DialogModule } from '@syncfusion/ej2-angular-popups';
import { ScorecardService } from '../../core/scorecard.service';
import { workListRows } from '../../core/work-views';
import { WorkHubFilter } from './work-hub-filter';

@Component({
  selector: 'app-work-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GridModule, DialogModule, ButtonModule],
  providers: [
    PageService,
    SortService,
    FilterService,
    ResizeService,
    ColumnChooserService,
    ExcelExportService,
    ToolbarService,
  ],
  templateUrl: './work-list.html',
})
export class WorkList {
  private readonly scorecard = inject(ScorecardService);
  private readonly hub = inject(WorkHubFilter);
  private readonly router = inject(Router);

  @ViewChild('detailDialog') private detailDialog?: DialogComponent;
  @ViewChild('listGrid') private listGrid?: GridComponent;

  protected readonly pageSettings = { pageSize: 15 };
  protected readonly toolbar = ['ColumnChooser', 'ExcelExport', 'CsvExport'];
  protected readonly selectedId = signal<string | null>(null);

  protected readonly rows = computed(() =>
    workListRows(this.scorecard.tickets(), this.scorecard.people(), {
      track: this.hub.track(),
      query: this.hub.query(),
    }),
  );

  protected readonly detail = computed(() => {
    const id = this.selectedId();
    if (!id) {
      return null;
    }
    return this.rows().find((row) => row.id === id) ?? null;
  });

  protected onRowSelected(event: { data?: { id?: string } }): void {
    const id = event.data?.id;
    if (!id) {
      return;
    }
    this.selectedId.set(id);
    this.detailDialog?.show();
  }

  protected onToolbarClick(args: { item?: { id?: string } }): void {
    const id = args.item?.id ?? '';
    if (id.endsWith('_excelexport')) {
      void this.listGrid?.excelExport();
    } else if (id.endsWith('_csvexport')) {
      void this.listGrid?.csvExport();
    }
  }

  protected goToBoard(): void {
    this.detailDialog?.hide();
    void this.router.navigate(['/work/board']);
  }
}

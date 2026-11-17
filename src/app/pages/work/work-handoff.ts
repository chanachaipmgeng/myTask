import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  CategoryService,
  ChartModule,
  LegendService,
  StackingBarSeriesService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import {
  ExcelExportService,
  FilterService,
  FreezeService,
  GridComponent,
  GridModule,
  PageService,
  SortService,
  ToolbarService,
} from '@syncfusion/ej2-angular-grids';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { effectiveRole } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import { KpiStatCardComponent } from '../../shared/kpi-stat-card/kpi-stat-card';

@Component({
  selector: 'app-work-handoff',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    ChartModule,
    GridModule,
    DropDownListModule,
    KpiStatCardComponent,
    MessageModule,
  ],
  providers: [
    CategoryService,
    StackingBarSeriesService,
    LegendService,
    TooltipService,
    PageService,
    SortService,
    FilterService,
    FreezeService,
    ToolbarService,
    ExcelExportService,
  ],
  templateUrl: './work-handoff.html',
})
export class WorkHandoffPage {
  protected readonly scorecard = inject(ScorecardService);
  protected readonly theme = inject(ThemeService);
  private readonly notice = inject(ShellNotice);

  protected readonly role = effectiveRole;
  protected readonly trackFilter = signal<string>('All');
  protected readonly onlyOverSla = signal<boolean>(false);

  protected readonly trackOptions = [
    { text: 'สายงาน: ทั้งหมด', value: 'All' },
    { text: 'Implement (IMP)', value: 'IMP' },
    { text: 'R&D (RND)', value: 'RND' },
    { text: 'QA / Tester', value: 'QA' },
    { text: 'UX-UI / BA', value: 'UXBA' },
    { text: 'Infra / DevOps', value: 'INFRA' },
  ];

  protected readonly report = this.scorecard.handoffReport;
  protected readonly kpis = computed(() => this.report().kpis);
  protected readonly stageAgingData = computed(() => this.report().stageAging);
  protected readonly blockerMatrix = computed(() => this.report().blockerMatrix);

  protected readonly filteredTickets = computed(() => {
    let list = this.report().tickets;
    const tf = this.trackFilter();
    if (tf !== 'All') {
      list = list.filter((t) => t.ownerTrack === tf || t.ownerTrack.includes(tf));
    }
    if (this.onlyOverSla()) {
      list = list.filter((t) => t.isOverSla);
    }
    return list;
  });

  protected readonly primaryXAxis = {
    valueType: 'Category',
    title: 'สายงาน',
    majorGridLines: { width: 0 },
  };

  protected readonly primaryYAxis = {
    title: 'ชั่วโมงเฉลี่ยสะสม (ชม.)',
    lineStyle: { width: 0 },
    majorTickLines: { width: 0 },
  };

  protected readonly chartTooltip = { enable: true };
  protected readonly chartLegend = { visible: true, position: 'Top' };

  protected setTrack(event: { value?: string }): void {
    this.trackFilter.set(event.value ?? 'All');
  }

  protected toggleOverSla(): void {
    this.onlyOverSla.update((v) => !v);
  }

  protected pingTarget(ticketId: string, targetName: string): void {
    void this.scorecard
      .pingHandoffRecipient(ticketId, targetName, `แจ้งเตือนการส่งต่องาน ${ticketId} เกิน SLA`)
      .then((result) => {
        this.notice.show(result.message || `แจ้งเตือนใบงาน ${ticketId} ถึง ${targetName}`);
      });
  }

  protected exportGrid(grid: GridComponent): void {
    void grid.excelExport();
  }
}

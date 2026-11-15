import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  ExcelExportService,
  FilterService,
  GridComponent,
  GridModule,
  PageService,
  SortService,
} from '@syncfusion/ej2-angular-grids';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';

@Component({
  selector: 'app-time-audit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    GridModule,
    MessageModule,
  ],
  providers: [
    PageService,
    SortService,
    FilterService,
    ExcelExportService,
  ],
  templateUrl: './time-audit.html',
})
export class TimeAuditPage {
  protected readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);

  protected readonly filterType = signal<string>('ALL');
  protected readonly report = this.scorecard.threeWayTimeReport;

  protected readonly filteredRows = computed(() => {
    const ft = this.filterType();
    const rows = this.report().rows;
    if (ft === 'MISSING') {
      return rows.filter((r) => r.anomalyType === 'MISSING_TIME');
    }
    if (ft === 'GHOST') {
      return rows.filter((r) => r.anomalyType === 'GHOST_PROGRESS');
    }
    if (ft === 'OVERRUN') {
      return rows.filter((r) => r.anomalyType === 'OUTLIER' || r.anomalyType === 'TIME_MISMATCH');
    }
    return rows;
  });

  protected setFilter(type: string): void {
    this.filterType.set(type);
  }

  protected rerunAudit(): void {
    this.notice.show('กำลังเรียกเครื่องยนต์ Python Analytics เพื่อคำนวณและตรวจสอบเวลา 3 ทางใหม่...');
    void this.scorecard.reloadFromApi();
  }

  protected exportGrid(grid: GridComponent): void {
    void grid.excelExport();
  }
}

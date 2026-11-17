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
import { BadgeTone } from '../../shared/ui/badge';
import { FilterChipOption, FilterChipsComponent } from '../../shared/ui/filter-chips/filter-chips';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge';

@Component({
  selector: 'app-time-audit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    GridModule,
    MessageModule,
    PageHeadComponent,
    SectionCardComponent,
    FilterChipsComponent,
    StatusBadgeComponent,
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

  protected readonly anomalyToneMap: Record<string, BadgeTone> = {
    OK: 'secondary',
    OUTLIER: 'danger',
    MISSING_TIME: 'danger',
    GHOST_PROGRESS: 'warning',
    TIME_MISMATCH: 'warning',
  };

  protected readonly filterOptions = computed<FilterChipOption[]>(() => {
    const r = this.report();
    return [
      { id: 'ALL', label: 'ทั้งหมด', count: r.totalTickets },
      { id: 'MISSING', label: 'ลืมลงเวลา Actual', count: r.missingTimeCount },
      { id: 'GHOST', label: 'ไม่มี Git Commit', count: r.ghostProgressCount },
      { id: 'OVERRUN', label: 'เกิน 1.5x / เวลาคลาดเคลื่อน', count: r.overrunCount },
    ];
  });

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
    this.notice.info('กำลังเรียกเครื่องยนต์ Python Analytics เพื่อคำนวณและตรวจสอบเวลา 3 ทางใหม่...');
    void this.scorecard.reloadFromApi();
  }

  protected exportGrid(grid: GridComponent): void {
    void grid.excelExport();
  }
}

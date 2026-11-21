import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { currentViewer } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { ShellNotice } from '../../core/shell-notice';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { BadgeTone } from '../../shared/ui/badge';
import { FilterChipOption, FilterChipsComponent } from '../../shared/ui/filter-chips/filter-chips';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge';

@Component({
  selector: 'app-time-audit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
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
  private readonly route = inject(ActivatedRoute);
  protected readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  private readonly ticketDetail = inject(TicketDetailService);

  protected openTicket(id: string): void {
    if (id) {
      this.ticketDetail.open(id);
    }
  }

  protected readonly isMine = this.route.snapshot.data['scope'] === 'mine';
  protected readonly activePersonId = computed(
    () => currentSession()?.person.id ?? currentViewer().id,
  );
  protected readonly myTicketIds = computed(() => {
    const selfId = this.activePersonId();
    return new Set(
      this.scorecard
        .tickets()
        .filter((t) => t.assigneeId === selfId)
        .map((t) => t.id),
    );
  });

  protected readonly filterType = signal<string>('ALL');
  protected readonly report = this.scorecard.threeWayTimeReport;

  protected readonly scopedRows = computed(() => {
    const rows = this.report().rows;
    if (!this.isMine) {
      return rows;
    }
    const mine = this.myTicketIds();
    return rows.filter((r) => mine.has(r.ticketId));
  });

  protected readonly anomalyToneMap: Record<string, BadgeTone> = {
    OK: 'secondary',
    OUTLIER: 'danger',
    MISSING_TIME: 'danger',
    GHOST_PROGRESS: 'warning',
    TIME_MISMATCH: 'warning',
  };

  protected readonly filterOptions = computed<FilterChipOption[]>(() => {
    const rows = this.scopedRows();
    return [
      { id: 'ALL', label: 'ทั้งหมด', count: rows.length },
      {
        id: 'MISSING',
        label: 'ลืมลงเวลา Actual',
        count: rows.filter((r) => r.anomalyType === 'MISSING_TIME').length,
      },
      {
        id: 'GHOST',
        label: 'ไม่มี Git Commit',
        count: rows.filter((r) => r.anomalyType === 'GHOST_PROGRESS').length,
      },
      {
        id: 'OVERRUN',
        label: 'เกิน 1.5x / เวลาคลาดเคลื่อน',
        count: rows.filter((r) => r.anomalyType === 'OUTLIER' || r.anomalyType === 'TIME_MISMATCH').length,
      },
    ];
  });

  protected readonly filteredRows = computed(() => {
    const ft = this.filterType();
    const rows = this.scopedRows();
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

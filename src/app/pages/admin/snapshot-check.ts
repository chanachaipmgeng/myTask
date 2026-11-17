import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import {
  ExcelExportService,
  FilterService,
  GridComponent,
  GridModule,
  PageService,
  SortService,
} from '@syncfusion/ej2-angular-grids';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { ProgressBarModule } from '@syncfusion/ej2-angular-progressbar';
import { ApiClient } from '../../core/api-client';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import { KpiStatCardComponent } from '../../shared/kpi-stat-card/kpi-stat-card';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge';

@Component({
  selector: 'app-snapshot-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    CheckBoxModule,
    GridModule,
    ProgressBarModule,
    MessageModule,
    PageHeadComponent,
    SectionCardComponent,
    StatusBadgeComponent,
    KpiStatCardComponent,
  ],
  providers: [
    PageService,
    SortService,
    FilterService,
    ExcelExportService,
  ],
  templateUrl: './snapshot-check.html',
})
export class SnapshotCheckPage {
  protected readonly scorecard = inject(ScorecardService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly notice = inject(ShellNotice);
  private readonly api = inject(ApiClient, { optional: true });

  protected readonly periodKey = signal('2026-11');
  protected readonly isConfirmed = signal(false);
  protected readonly isFreezing = signal(false);

  protected readonly report = this.scorecard.preflightReport;
  protected readonly readinessScore = computed(() => this.report().overallReadinessScore);
  protected readonly checks = computed(() => this.report().checks);
  protected readonly previewDiffs = computed(() => this.report().previewDiffs);

  protected onConfirmChange(event: { checked?: boolean }): void {
    this.isConfirmed.set(Boolean(event.checked));
  }

  protected async freezeSnapshot(): Promise<void> {
    if (!this.isConfirmed()) {
      this.notice.warning('กรุณาทำเครื่องหมายยืนยันว่าได้ตรวจสอบข้อมูลครบถ้วนแล้ว');
      return;
    }
    this.isFreezing.set(true);
    const periodKey = this.periodKey().trim();
    const periodType = periodKey.includes('Q') ? 'quarter' : 'month';
    try {
      if (this.scorecard.usingApi() && this.api) {
        const result = await this.api.captureKpiSnapshot(periodType, periodKey);
        if (!result.ok) {
          this.notice.error(result.message ?? 'แช่แข็ง snapshot ไม่สำเร็จ');
          return;
        }
        this.notice.success(`บันทึกและแช่แข็งคะแนน KPI งวด ${periodKey} แล้ว ${result.count ?? 0} คน`);
      } else {
        this.notice.info(`โหมดจำลอง: แช่แข็งงวด ${periodKey} ในเครื่องเท่านั้น`);
      }
      void this.router.navigate(['/team']);
    } catch (err) {
      this.notice.error(err instanceof Error ? err.message : 'แช่แข็ง snapshot ไม่สำเร็จ');
    } finally {
      this.isFreezing.set(false);
    }
  }

  protected cancel(): void {
    void this.router.navigate(['/team']);
  }
}

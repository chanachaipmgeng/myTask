import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { ApiClient } from '../../core/api-client';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import {
  KpiStatCardComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  SfCheckboxComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
  StatusBadgeComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-snapshot-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    PageHeadComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    StatusBadgeComponent,
    KpiStatCardComponent,
    SfGridComponent,
    SfCheckboxComponent,
  ],
  templateUrl: './snapshot-check.html',
})
export class SnapshotCheckPage {
  protected readonly gridColumns: SfGridColumn[] = [
    { field: 'nickname', headerText: 'พนักงาน', width: 175 },
    { field: 'trackLabel', headerText: 'สายงาน', width: 145 },
    { field: 'previousIndex', headerText: 'ดัชนีงวดก่อน', width: 130, textAlign: 'Right' },
    { field: 'currentIndex', headerText: 'ดัชนีงวดนี้ (สด)', width: 145, textAlign: 'Right' },
    { field: 'diff', headerText: 'ส่วนต่าง (Diff)', width: 130, textAlign: 'Right' },
    { field: 'statusLabel', headerText: 'สถานะเทียบเป้า', width: 145, textAlign: 'Center' },
  ];

  protected readonly gridOptions: SfGridOptions = listGridOptions({
    id: 'snapshot-preview-diff-grid-v2',
    excelExport: true,
    csvExport: true,
    exportFileName: 'snapshot-preview-diff',
  });
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
  protected readonly checks = computed(() =>
    this.report().checks.map((item) => {
      const numMatch = item.summary.match(/\d+/);
      const shortValue =
        item.status === 'PASS'
          ? 'ผ่าน'
          : numMatch
            ? `${numMatch[0]} รายการ`
            : 'ต้องตรวจ';
      return {
        ...item,
        shortTitle: `ด่านที่ ${item.stage} · ${item.name.replace(/\s*\([^)]*\)\s*/g, '').trim()}`,
        shortValue,
        fullHint: `${item.summary} — ${item.detail}`,
      };
    }),
  );
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

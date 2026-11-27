import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { previousMonthKey } from '../../../../shared/domain/kpi-snapshot';
import { todayInBangkok } from '../../../../shared/domain/workflow';
import { ApiClient } from '../../core/api-client';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import {
  KpiStatCardComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  StatusBadgeComponent,
} from '../../shared/ui';
import { SfCheckboxComponent } from '../../shared/sf/sf-checkbox/sf-checkbox';
import {
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
} from '../../shared/sf/sf-grid/sf-grid';

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
    { field: 'nickname', headerText: 'พนักงาน', width: 175, cellType: 'person', personIdField: 'personId' },
    { field: 'trackLabel', headerText: 'สายงาน', width: 145, cellType: 'badge' },
    { field: 'previousIndex', headerText: 'ดัชนีงวดก่อน', width: 130, textAlign: 'Right', cellType: 'metric', format: 'N1' },
    { field: 'currentIndex', headerText: 'ดัชนีงวดนี้ (สด)', width: 145, textAlign: 'Right', cellType: 'progress', format: 'N1' },
    { field: 'diff', headerText: 'ส่วนต่าง (Diff)', width: 130, textAlign: 'Right', cellType: 'delta', format: 'N1' },
    { field: 'statusLabel', headerText: 'สถานะเทียบเป้า', width: 145, textAlign: 'Center', cellType: 'badge' },
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

  protected readonly periodKey = signal(previousMonthKey(todayInBangkok()));
  protected readonly isConfirmed = signal(false);
  protected readonly isFreezing = signal(false);

  protected readonly report = this.scorecard.preflightReport;
  protected readonly readinessScore = computed(() => this.report().overallReadinessScore);
  private static readonly STAGE_SHORT_NAMES: Record<number, string> = {
    1: 'ซิงก์ OpenProject',
    2: 'ข้อพิพาท & เลื่อนวัน',
    3: 'ตรวจสอบวันลา',
    4: 'สรุปโควตา/คะแนน',
  };

  protected readonly checks = computed(() =>
    this.report().checks.map((item) => {
      const numMatch = item.summary.match(/\d+/);
      const shortValue =
        item.status === 'PASS'
          ? 'ผ่าน'
          : numMatch
            ? `${numMatch[0]} รายการ`
            : 'ต้องตรวจ';
      const conciseName = SnapshotCheckPage.STAGE_SHORT_NAMES[item.stage] ?? item.name.replace(/\s*\([^)]*\)\s*/g, '').trim();
      return {
        ...item,
        shortTitle: `ด่านที่ ${item.stage} · ${conciseName}`,
        shortValue,
        fullHint: `${item.summary} — ${item.detail}`,
      };
    }),
  );
  protected readonly previewDiffs = computed(() => this.report().previewDiffs);

  /** เกตเบาๆ: mapping CF / ความครบของ estimate·due — ไม่บล็อก freeze */
  protected readonly syncHygieneHints = computed(() => {
    const tickets = this.scorecard.tickets();
    const hints: string[] = [];
    if (!tickets.length) {
      hints.push('ยังไม่มีใบงานในระบบ — ตรวจ sync OpenProject / bootstrap');
      return hints;
    }
    const missingEstimate = tickets.filter((t) => !(t.estimateMd > 0)).length;
    const missingDue = tickets.filter((t) => !t.dueOn && !t.firstDueOn).length;
    const missingTrackCfProxy = tickets.filter((t) => {
      const tr = String(t.track ?? '');
      return !tr || tr === 'Implement';
    }).length;
    const estPct = Math.round((missingEstimate / tickets.length) * 100);
    const duePct = Math.round((missingDue / tickets.length) * 100);
    const impPct = Math.round((missingTrackCfProxy / tickets.length) * 100);
    if (estPct >= 40) {
      hints.push(`ใบงานไม่มี estimate MD สูง (~${estPct}%) — ตรวจ CF Size / ชั่วโมงใน myProject`);
    }
    if (duePct >= 40) {
      hints.push(`ใบงานไม่มี due/firstDue สูง (~${duePct}%) — ตรวจ Due Date / Auto-SLA / CF วันที่`);
    }
    if (impPct >= 85) {
      hints.push(
        `ใบงานส่วนใหญ่เป็นสาย Implement (~${impPct}%) — ตรวจ mapping CF track / projectTrack บน /integrations`,
      );
    }
    if (!hints.length) {
      hints.push('สุขลักษณะ sync พอใช้ได้ (estimate/due/track ไม่ผิดปกติชัด)');
    }
    return hints;
  });

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

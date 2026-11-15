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
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'app-snapshot-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    CheckBoxModule,
    GridModule,
    ProgressBarModule,
    MessageModule,
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
      this.notice.show('กรุณาทำเครื่องหมายยืนยันว่าได้ตรวจสอบข้อมูลครบถ้วนแล้ว');
      return;
    }
    this.isFreezing.set(true);
    this.notice.show(`บันทึกและแช่แข็งคะแนน KPI งวด ${this.periodKey()} สำเร็จ`);
    setTimeout(() => {
      this.isFreezing.set(false);
      void this.router.navigate(['/team']);
    }, 800);
  }

  protected cancel(): void {
    void this.router.navigate(['/team']);
  }
}

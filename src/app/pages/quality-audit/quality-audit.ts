import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  FilterService,
  GridComponent,
  GridModule,
  PageService,
  SortService,
} from '@syncfusion/ej2-angular-grids';
import { TabModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { effectiveRole } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';

@Component({
  selector: 'app-quality-audit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    GridModule,
    TabModule,
    MessageModule,
  ],
  providers: [
    PageService,
    SortService,
    FilterService,
  ],
  templateUrl: './quality-audit.html',
})
export class QualityAuditPage {
  protected readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);

  protected readonly role = effectiveRole;
  protected readonly report = this.scorecard.qualityAuditReport;
  protected readonly kpis = computed(() => this.report().kpis);
  protected readonly dodChecklist = computed(() => this.report().dodChecklist);
  protected readonly reopenEscapes = computed(() => this.report().reopenEscapes);

  protected rejectToDev(ticketId: string, devName: string): void {
    this.notice.show(`ส่งการ์ด ${ticketId} ตีกลับไปยัง ${devName} เนื่องจากหลักฐาน DoD ไม่ครบถ้วน`);
  }
}

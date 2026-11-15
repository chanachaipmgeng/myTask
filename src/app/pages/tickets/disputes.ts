import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import {
  FilterService,
  GridComponent,
  GridModule,
  PageService,
  RecordClickEventArgs,
  SortService,
} from '@syncfusion/ej2-angular-grids';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { DialogModule } from '@syncfusion/ej2-angular-popups';
import { effectiveRole } from '../../core/admin-settings';
import { TicketDispute, VarianceCode } from '../../core/models';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';

@Component({
  selector: 'app-disputes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonModule,
    GridModule,
    DropDownListModule,
    TextBoxModule,
    DialogModule,
    MessageModule,
  ],
  providers: [
    PageService,
    SortService,
    FilterService,
  ],
  templateUrl: './disputes.html',
})
export class DisputesPage {
  protected readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);

  protected readonly role = effectiveRole;
  protected readonly statusFilter = signal<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  protected readonly disputes = this.scorecard.disputes;

  protected readonly filteredDisputes = computed(() => {
    const status = this.statusFilter();
    return this.disputes().filter((d) => d.status === status);
  });

  protected readonly selectedDispute = signal<TicketDispute | null>(null);

  // Form states for new dispute
  protected showCreateDialog = signal(false);
  protected newTicketId = signal('');
  protected newRequestedFlag = signal<VarianceCode>('BLK');
  protected newReason = signal('');
  protected newEvidenceUrl = signal('');

  protected reviewerComment = signal('');

  protected readonly varianceOptions = [
    { text: 'ขอติดป้าย BLK (ติดระบบอื่นภายนอก)', value: 'BLK' },
    { text: 'ขอติดป้าย ENV (เซิร์ฟเวอร์/Environment ล่ม)', value: 'ENV' },
    { text: 'ขอติดป้าย REQ (Requirement ไม่เคลียร์/มีการแก้สเปก)', value: 'REQ' },
  ];

  protected readonly ticketOptions = computed(() =>
    this.scorecard.tickets().map((t) => ({
      text: `${t.id} - ${t.title || t.module} (คะแนน: ${t.actualMd} MD)`,
      value: t.id,
    })),
  );

  constructor() {
    // Select first dispute by default if available
    const pending = this.disputes().find((d) => d.status === 'PENDING');
    if (pending) {
      this.selectedDispute.set(pending);
    }
  }

  protected setStatus(status: 'PENDING' | 'APPROVED' | 'REJECTED'): void {
    this.statusFilter.set(status);
    const first = this.disputes().find((d) => d.status === status);
    this.selectedDispute.set(first ?? null);
  }

  protected onRecordClick(args: RecordClickEventArgs): void {
    const dispute = args.rowData as TicketDispute;
    this.selectedDispute.set(dispute);
    this.reviewerComment.set(dispute.reviewerComment ?? '');
  }

  protected openCreateDialog(): void {
    const firstTicket = this.scorecard.tickets()[0]?.id ?? '';
    this.newTicketId.set(firstTicket);
    this.newRequestedFlag.set('BLK');
    this.newReason.set('');
    this.newEvidenceUrl.set('');
    this.showCreateDialog.set(true);
  }

  protected closeCreateDialog(): void {
    this.showCreateDialog.set(false);
  }

  protected async submitNewDispute(): Promise<void> {
    if (!this.newTicketId() || !this.newReason().trim()) {
      this.notice.show('กรุณากรอกรหัสใบงานและเหตุผลในการยื่นคำขอ');
      return;
    }
    const created = await this.scorecard.submitDispute(
      this.newTicketId(),
      this.newRequestedFlag(),
      this.newReason(),
      this.newEvidenceUrl(),
    );
    this.showCreateDialog.set(false);
    this.selectedDispute.set(created);
    this.notice.show(`ส่งคำขอทบทวนคะแนน ${created.disputeCode} สำเร็จ`);
  }

  protected async resolve(status: 'APPROVED' | 'REJECTED'): Promise<void> {
    const sel = this.selectedDispute();
    if (!sel) return;

    await this.scorecard.resolveDispute(sel.id, status, this.reviewerComment());
    this.notice.show(
      status === 'APPROVED'
        ? `อนุมัติคำขอ ${sel.disputeCode} และคำนวณคะแนนใหม่เรียบร้อยแล้ว`
        : `ปฏิเสธคำขอ ${sel.disputeCode}`,
    );

    // Refresh selected
    const updated = this.scorecard.disputes().find((d) => d.id === sel.id);
    this.selectedDispute.set(updated ?? null);
  }
}

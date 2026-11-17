import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import {
  FilterService,
  GridModule,
  PageService,
  RecordClickEventArgs,
  SortService,
} from '@syncfusion/ej2-angular-grids';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { SplitterModule } from '@syncfusion/ej2-angular-layouts';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { DialogModule } from '@syncfusion/ej2-angular-popups';
import { effectiveRole } from '../../core/admin-settings';
import { TicketDispute, VarianceCode } from '../../core/models';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { KpiStatCardComponent } from '../../shared/kpi-stat-card/kpi-stat-card';
import { BadgeTone } from '../../shared/ui/badge';
import { FilterChipOption, FilterChipsComponent } from '../../shared/ui/filter-chips/filter-chips';
import { FormFieldComponent } from '../../shared/ui/form-field/form-field';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge';

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
    SplitterModule,
    PageHeadComponent,
    SectionCardComponent,
    FilterChipsComponent,
    FormFieldComponent,
    StatusBadgeComponent,
    KpiStatCardComponent,
  ],
  providers: [
    PageService,
    SortService,
    FilterService,
  ],
  templateUrl: './disputes.html',
  styleUrl: './disputes.scss',
})
export class DisputesPage implements OnInit {
  protected readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  private readonly destroyRef = inject(DestroyRef);

  /** กว้าง: ซ้าย–ขวา · แคบ: บน–ล่าง */
  protected readonly splitterOrientation = signal<'Horizontal' | 'Vertical'>('Horizontal');
  protected readonly splitterHeight = signal('560px');

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

  protected readonly statusToneMap: Record<string, BadgeTone> = {
    PENDING: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
  };

  protected readonly statusChipOptions = computed<FilterChipOption[]>(() => {
    const all = this.disputes();
    return [
      { id: 'PENDING', label: 'รออนุมัติ', count: all.filter((d) => d.status === 'PENDING').length },
      { id: 'APPROVED', label: 'อนุมัติแล้ว', count: all.filter((d) => d.status === 'APPROVED').length },
      { id: 'REJECTED', label: 'ปฏิเสธ', count: all.filter((d) => d.status === 'REJECTED').length },
    ];
  });

  ngOnInit(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(max-width: 800px)');
    const apply = (): void => {
      const narrow = mq.matches;
      this.splitterOrientation.set(narrow ? 'Vertical' : 'Horizontal');
      this.splitterHeight.set(narrow ? '920px' : '560px');
    };
    apply();
    mq.addEventListener('change', apply);
    this.destroyRef.onDestroy(() => mq.removeEventListener('change', apply));
  }

  protected setStatus(status: string): void {
    const next = (status === 'APPROVED' || status === 'REJECTED' ? status : 'PENDING') as
      | 'PENDING'
      | 'APPROVED'
      | 'REJECTED';
    this.statusFilter.set(next);
    this.selectedDispute.set(null);
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
      this.notice.warning('กรุณากรอกรหัสใบงานและเหตุผลในการยื่นคำขอ');
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
    this.notice.success(`ส่งคำขอทบทวนคะแนน ${created.disputeCode} สำเร็จ`);
  }

  protected async resolve(status: 'APPROVED' | 'REJECTED'): Promise<void> {
    const sel = this.selectedDispute();
    if (!sel) return;

    await this.scorecard.resolveDispute(sel.id, status, this.reviewerComment());
    if (status === 'APPROVED') {
      this.notice.success(`อนุมัติคำขอ ${sel.disputeCode} และคำนวณคะแนนใหม่เรียบร้อยแล้ว`);
    } else {
      this.notice.warning(`ปฏิเสธคำขอ ${sel.disputeCode}`);
    }

    const updated = this.scorecard.disputes().find((d) => d.id === sel.id);
    this.selectedDispute.set(updated ?? null);
  }
}

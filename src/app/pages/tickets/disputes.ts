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
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { SpeechToTextModule, TranscriptChangedEventArgs } from '@syncfusion/ej2-angular-inputs';
import { currentViewer, effectiveRole } from '../../core/admin-settings';
import { TicketDispute, VarianceCode } from '../../core/models';
import { scoreTicket } from '../../core/scoring';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { ShellNotice } from '../../core/shell-notice';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { KpiStatCardComponent } from '../../shared/kpi-stat-card/kpi-stat-card';
import {
  defaultThaiSpeechButtonSettings,
  mergeSpeechTranscript,
  speechErrorMessageTh,
} from '../../shared/speech-to-text';
import {
  BadgeTone,
  FilterChipOption,
  FilterChipsComponent,
  FormFieldComponent,
  PageHeadComponent,
  SectionCardComponent,
  SfDialogComponent,
  SfDropdownComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
  SfMessageComponent,
  SfSplitterComponent,
  SfSplitterOptions,
  SfSplitterPane,
  SfTextBoxComponent,
  StatusBadgeComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-disputes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonModule,
    SpeechToTextModule,
    PageHeadComponent,
    SectionCardComponent,
    FilterChipsComponent,
    FormFieldComponent,
    StatusBadgeComponent,
    KpiStatCardComponent,
    SfDialogComponent,
    SfDropdownComponent,
    SfGridComponent,
    SfMessageComponent,
    SfSplitterComponent,
    SfTextBoxComponent,
  ],
  templateUrl: './disputes.html',
  styleUrl: './disputes.scss',
})
export class DisputesPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  protected readonly scorecard = inject(ScorecardService);
  private readonly workspace = inject(WorkspaceFilter);
  private readonly notice = inject(ShellNotice);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly destroyRef = inject(DestroyRef);

  protected openTicket(id: string): void {
    if (id) {
      this.ticketDetail.open(id);
    }
  }

  protected readonly isMine = computed(
    () => this.route.snapshot.data['scope'] === 'mine' || effectiveRole() === 'member',
  );

  /** กว้าง: ซ้าย–ขวา · แคบ: บน–ล่าง */
  protected readonly splitterOrientation = signal<'Horizontal' | 'Vertical'>('Horizontal');
  protected readonly splitterHeight = signal('560px');
  protected readonly splitterPanes: SfSplitterPane[] = [
    { id: 'list', size: '58%', min: '280px', collapsible: true },
    { id: 'detail', size: '42%', min: '260px', collapsible: true },
  ];
  protected readonly splitterOptions = computed<SfSplitterOptions>(() => ({
    cssClass: 'disputes-splitter',
    height: this.splitterHeight(),
    orientation: this.splitterOrientation(),
    separatorSize: 5,
  }));
  protected readonly disputeColumns: SfGridColumn[] = [
    { field: 'disputeCode', headerText: 'รหัสคำขอ', width: 105 },
    { field: 'ticketId', headerText: 'ใบงาน', width: 90 },
    { field: 'requesterId', headerText: 'ผู้ยื่น', width: 95 },
    { field: 'requestedFlag', headerText: 'ประเภท', width: 105 },
    { field: 'scoreDiff', headerText: 'คะแนนเดิม > ใหม่', width: 120, textAlign: 'Right' },
    { field: 'status', headerText: 'สถานะ', width: 110 },
  ];
  protected readonly disputeGridOptions: SfGridOptions = listGridOptions({
    id: 'disputes-list-grid',
    height: '380',
  });

  protected readonly role = effectiveRole;
  protected readonly statusFilter = signal<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  protected readonly disputes = this.scorecard.disputes;

  private readonly activePersonId = computed(
    () => currentSession()?.person.id ?? currentViewer().id,
  );

  /** Member sees only their own requests; lead/admin see team/org queue filtered by WorkspaceFilter. */
  private readonly scopedDisputes = computed(() => {
    const all = this.disputes();
    if (this.isMine()) {
      const personId = this.activePersonId();
      return all.filter((d) => d.requesterId === personId);
    }
    const ticketIds = new Set(this.workspace.applyToTickets(this.scorecard.tickets()).map((t) => t.id));
    const peopleIds = new Set(this.workspace.applyToPeople(this.scorecard.people()).map((p) => p.id));
    if (!this.workspace.hasActiveFilter()) {
      return all;
    }
    return all.filter(
      (d) => ticketIds.has(d.ticketId) || peopleIds.has(d.requesterId),
    );
  });

  protected readonly filteredDisputes = computed(() => {
    const status = this.statusFilter();
    return this.scopedDisputes().filter((d) => d.status === status);
  });

  protected readonly selectedDispute = signal<TicketDispute | null>(null);

  // Form states for new dispute
  protected showCreateDialog = signal(false);
  protected newTicketId = signal('');
  protected newRequestedFlag = signal<VarianceCode>('BLK');
  protected newReason = signal('');
  protected newEvidenceUrl = signal('');

  protected reviewerComment = signal('');
  private reasonSpeechBase = '';

  protected readonly speechButtonSettings = defaultThaiSpeechButtonSettings;
  protected readonly speechTooltipSettings = {
    content: 'พูดเหตุผลเป็นภาษาไทย (ต้องอนุญาตไมโครโฟน)',
    stopContent: 'หยุดฟัง',
  };

  protected readonly varianceOptions = [
    { text: 'ขอติดป้าย BLK (ติดระบบอื่นภายนอก)', value: 'BLK' },
    { text: 'ขอติดป้าย ENV (เซิร์ฟเวอร์/Environment ล่ม)', value: 'ENV' },
    { text: 'ขอติดป้าย REQ (Requirement ไม่เคลียร์/มีการแก้สเปก)', value: 'REQ' },
  ];

  protected readonly ticketOptions = computed(() => {
    const personId = this.activePersonId();
    const mineOnly = this.isMine();
    const tickets = mineOnly
      ? this.scorecard.tickets().filter((t) => t.assigneeId === personId)
      : this.workspace.applyToTickets(this.scorecard.tickets());
    return tickets.map((t) => {
      const score = t.closed ? scoreTicket(t).total : null;
      const scoreLabel = score !== null ? `คะแนน: ${score} คะแนน` : `ยังไม่ปิด · ${t.actualMd} MD`;
      return {
        text: `${t.id} - ${t.title || t.module} (${scoreLabel})`,
        value: t.id,
      };
    });
  });

  protected readonly statusToneMap: Record<string, BadgeTone> = {
    PENDING: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
  };

  protected readonly statusChipOptions = computed<FilterChipOption[]>(() => {
    const all = this.scopedDisputes();
    return [
      { id: 'PENDING', label: 'รออนุมัติ', count: all.filter((d) => d.status === 'PENDING').length },
      { id: 'APPROVED', label: 'อนุมัติแล้ว', count: all.filter((d) => d.status === 'APPROVED').length },
      { id: 'REJECTED', label: 'ปฏิเสธ', count: all.filter((d) => d.status === 'REJECTED').length },
    ];
  });

  ngOnInit(): void {
    const presetTicketId = this.route.snapshot.queryParamMap.get('ticketId');
    if (presetTicketId) {
      this.newTicketId.set(presetTicketId);
      this.showCreateDialog.set(true);
    }

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(max-width: 800px)');
    const phone = window.matchMedia('(max-width: 640px)');
    const apply = (): void => {
      const narrow = mq.matches;
      this.splitterOrientation.set(narrow ? 'Vertical' : 'Horizontal');
      this.splitterHeight.set(phone.matches ? 'auto' : narrow ? '920px' : '560px');
    };
    apply();
    mq.addEventListener('change', apply);
    phone.addEventListener('change', apply);
    this.destroyRef.onDestroy(() => {
      mq.removeEventListener('change', apply);
      phone.removeEventListener('change', apply);
    });
  }

  protected setStatus(status: string): void {
    const next = (status === 'APPROVED' || status === 'REJECTED' ? status : 'PENDING') as
      | 'PENDING'
      | 'APPROVED'
      | 'REJECTED';
    this.statusFilter.set(next);
    this.selectedDispute.set(null);
  }

  protected onRowSelected(args: { data?: unknown }): void {
    const dispute = args.data as TicketDispute | undefined;
    if (!dispute) return;
    this.selectedDispute.set(dispute);
    this.reviewerComment.set(dispute.reviewerComment ?? '');
  }

  protected setNewRequestedFlag(val: string): void {
    if (val === 'BLK' || val === 'ENV' || val === 'REQ') {
      this.newRequestedFlag.set(val);
    }
  }

  protected openCreateDialog(): void {
    const firstTicket = this.scorecard.tickets()[0]?.id ?? '';
    this.newTicketId.set(firstTicket);
    this.newRequestedFlag.set('BLK');
    this.newReason.set('');
    this.newEvidenceUrl.set('');
    this.reasonSpeechBase = '';
    this.showCreateDialog.set(true);
  }

  protected closeCreateDialog(): void {
    this.showCreateDialog.set(false);
  }

  protected onReasonSpeechStart(): void {
    this.reasonSpeechBase = this.newReason().trim();
  }

  protected onReasonSpeechTranscript(args: TranscriptChangedEventArgs): void {
    this.newReason.set(mergeSpeechTranscript(this.reasonSpeechBase, String(args.transcript ?? '')));
  }

  protected onReasonSpeechError(args: { error?: string }): void {
    this.notice.warning(speechErrorMessageTh(args.error));
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

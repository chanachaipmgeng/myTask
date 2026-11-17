import { ChangeDetectionStrategy, Component, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { DatePickerModule } from '@syncfusion/ej2-angular-calendars';
import { DropDownListModule, MultiSelectModule } from '@syncfusion/ej2-angular-dropdowns';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { KanbanModule } from '@syncfusion/ej2-angular-kanban';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { TimelineAllModule, TimelineModule } from '@syncfusion/ej2-angular-layouts';
import { DialogComponent, DialogModule } from '@syncfusion/ej2-angular-popups';
import { DragEventArgs, SwimlaneSettingsModel } from '@syncfusion/ej2-kanban';
import { effectiveRole } from '../../core/admin-settings';
import { buildDeliveryTimeline } from '../../core/delivery-timeline';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import { KpiStatCardComponent } from '../../shared/kpi-stat-card/kpi-stat-card';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormFieldComponent } from '../../shared/ui/form-field/form-field';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';
import {
  BUG_CAUSES,
  BugCause,
  DISCIPLINES,
  Discipline,
  POC_RESULTS,
  PocResult,
  STORY_POINTS,
  StoryPoint,
  Ticket,
  WORK_CATEGORIES,
  WORKFLOW_STATUSES,
  WorkCategory,
} from '../../core/models';
import {
  CATEGORY_LABELS,
  DISCIPLINE_LABELS,
  canEditBoardPlanning,
  canMoveWorkflowByRole,
  editWorkflow,
  isBugCategory,
  isWorkflowStatus,
  moveWorkflow,
  pipelineReport,
  todayInBangkok,
  workflowStatusOf,
} from '../../core/workflow';
import { WorkHubFilter } from './work-hub-filter';

type SwimlaneMode = 'none' | 'assignee' | 'track';

@Component({
  selector: 'app-work-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    KanbanModule,
    DialogModule,
    DropDownListModule,
    MultiSelectModule,
    DatePickerModule,
    TextBoxModule,
    ButtonModule,
    CheckBoxModule,
    MessageModule,
    TimelineModule,
    TimelineAllModule,
    KpiStatCardComponent,
    ConfirmDialogComponent,
    FormFieldComponent,
    SectionCardComponent,
  ],
  templateUrl: './work-board.html',
})
export class WorkBoard {
  protected readonly Math = Math;
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  private readonly hub = inject(WorkHubFilter);
  protected readonly theme = inject(ThemeService);
  private readonly boardRevision = signal(0);

  @ViewChild('blockDialog') private blockDialog?: ConfirmDialogComponent;
  @ViewChild('editDialog') private editDialog?: DialogComponent;
  @ViewChild('mdShiftDialog') private mdShiftDialog?: DialogComponent;

  // MD-DIRECT Auto-Shift Dialog State
  protected readonly pendingMdTicket = signal<Ticket | null>(null);
  protected readonly conflictingWipTickets = signal<Ticket[]>([]);
  protected readonly mdShiftDays = signal<number>(1);

  protected readonly role = effectiveRole;
  protected readonly canEditPlanning = computed(() => canEditBoardPlanning(this.role()));
  protected readonly roleBanner = computed(() =>
    this.canEditPlanning()
      ? `สิทธิ์ ${this.role()}: ลากการ์ดได้ทุกสถานะ (รวมปิดงานเข้า Done) และแก้ไขฟิลด์วางแผน/ส่งมอบได้ครบ`
      : 'สิทธิ์ member: ลากสถานะทำงานได้ถึง Ready for QA / In QA และบันทึกได้เฉพาะลิงก์ MR / ผล PoC / สาเหตุ Bug (การปิดเข้า Done และการตั้ง Story Points/วันส่งครั้งแรกเป็นสิทธิ์ของ lead/admin)',
  );

  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly swimlaneOptions = [
    { text: 'ไม่จัดกลุ่ม Swimlane', value: 'none' },
    { text: 'แยกตามผู้รับผิดชอบ', value: 'assignee' },
    { text: 'แยกตามสายงาน (Track)', value: 'track' },
  ];
  protected readonly swimlaneMode = signal<SwimlaneMode>('none');
  protected readonly swimlaneSettings = computed<SwimlaneSettingsModel>(() => {
    const mode = this.swimlaneMode();
    if (mode === 'assignee') {
      return { keyField: 'assigneeKey', textField: 'assigneeLabel', showItemCount: true };
    }
    if (mode === 'track') {
      return { keyField: 'trackKey', textField: 'trackLabel', showItemCount: true };
    }
    return {};
  });

  protected readonly columns = WORKFLOW_STATUSES.map((status) => ({
    headerText: status,
    keyField: status,
    showItemCount: true,
    showAddButton: false,
  }));
  protected readonly cardSettings = { headerField: 'id', contentField: 'summary' };
  protected readonly disciplineOptions = [
    { text: 'ยังไม่เลือก', value: '' },
    ...DISCIPLINES.map((value) => ({ text: DISCIPLINE_LABELS[value], value })),
  ];
  protected readonly categoryOptions = [
    { text: 'ยังไม่เลือก', value: '' },
    ...WORK_CATEGORIES.map((value) => ({ text: CATEGORY_LABELS[value], value })),
  ];
  protected readonly storyOptions = [
    { text: 'ยังไม่เลือก', value: '' },
    ...STORY_POINTS.map((value) => ({ text: String(value), value: String(value) })),
  ];
  protected readonly pocOptions = [
    { text: 'ยังไม่เลือก', value: '' },
    ...POC_RESULTS.map((value) => ({ text: value, value })),
  ];
  protected readonly causeOptions = [
    { text: 'ยังไม่เลือก', value: '' },
    ...BUG_CAUSES.map((value) => ({ text: value, value })),
  ];

  protected readonly selectedId = signal<string | null>(null);
  protected readonly blockMessage = signal('');

  protected readonly discipline = signal<Discipline | ''>('');
  protected readonly workCategory = signal<WorkCategory | ''>('');
  protected readonly storyValue = signal('');
  protected readonly due = signal<Date | null>(null);
  protected readonly dueLocked = signal(false);
  protected readonly mrLink = signal('');
  protected readonly pocResult = signal<PocResult | ''>('');
  protected readonly bugCause = signal<BugCause | ''>('');

  protected readonly visibleTickets = computed(() => {
    const track = this.hub.track();
    const query = this.hub.query().trim().toLowerCase();
    return this.scorecard.tickets().filter((ticket) => {
      if (track !== 'All' && ticket.track !== track) {
        return false;
      }
      if (!query) {
        return true;
      }
      return `${ticket.id} ${ticket.title ?? ''} ${ticket.module}`.toLowerCase().includes(query);
    });
  });

  protected readonly cards = computed(() => {
    this.boardRevision();
    const names = new Map(this.scorecard.people().map((person) => [person.id, person.nickname]));
    return this.visibleTickets().map((ticket) => {
      const assigneeLabel = names.get(ticket.assigneeId) ?? 'ยังไม่มีผู้รับ';
      const trackLabel = ticket.track === 'RD' ? 'R&D' : 'Implement';
      return {
        id: ticket.id,
        status: workflowStatusOf(ticket),
        title: ticket.title?.trim() || ticket.module,
        module: ticket.module,
        size: ticket.size,
        trackKey: ticket.track,
        trackLabel,
        assigneeKey: ticket.assigneeId || 'unassigned',
        assigneeLabel,
        storyPoints: ticket.storyPoints ?? '—',
        dueLabel: ticket.dueOn ?? ticket.firstDueOn ?? '—',
        hasMr: Boolean(ticket.mrLink?.trim()),
        reopenCount: ticket.reopenCount,
        isMdDirect: Boolean(ticket.isMdDirect),
        isPaused: Boolean(ticket.isPaused),
        pausedReason: ticket.pausedReason,
        summary: `${ticket.module} · ${assigneeLabel} · ${ticket.storyPoints ?? '—'} pts`,
      };
    });
  });

  protected readonly report = computed(() => pipelineReport(this.visibleTickets(), this.scorecard.people()));

  protected readonly velocityTotal = computed(() =>
    this.report().velocity.reduce((sum, row) => sum + row.points, 0),
  );

  protected readonly velocityHint = computed(() => {
    const rows = this.report().velocity;
    if (rows.length === 0) {
      return 'ยังไม่มีใบ Done';
    }
    return rows
      .slice(0, 3)
      .map((row) => `${row.name} ${row.points}`)
      .join(' · ');
  });

  protected readonly categoryHint = computed(() =>
    this.report()
      .categories.slice(0, 3)
      .map((row) => `${row.label} ${row.pct}%`)
      .join(' · '),
  );

  protected readonly selected = computed(
    () => this.scorecard.tickets().find((ticket) => ticket.id === this.selectedId()) ?? null,
  );

  /** เส้นเหตุการณ์ส่งมอบใน Dialog แก้การ์ด */
  protected readonly deliveryTimeline = computed(() => {
    const ticket = this.selected();
    if (!ticket) {
      return [];
    }
    return buildDeliveryTimeline(ticket, this.scorecard.stageLogs());
  });

  constructor() {
    effect(() => {
      this.fillForm(this.selected());
    });
  }

  protected setSwimlane(event: { value?: string | null }): void {
    const val = event.value;
    if (val === 'none' || val === 'assignee' || val === 'track') {
      this.swimlaneMode.set(val);
    }
  }

  protected onCardClick(args: { data?: { id?: string } }): void {
    const id = args.data?.id;
    if (id) {
      this.selectedId.set(id);
      this.editDialog?.show();
    }
  }

  protected closeEditDialog(): void {
    this.editDialog?.hide();
  }

  protected onDialogOpen(args: { cancel?: boolean }): void {
    args.cancel = true;
  }

  protected onDragStop(args: DragEventArgs): void {
    const dragged = args.data?.[0];
    const id = typeof dragged?.['id'] === 'string' ? dragged['id'] : '';
    const target = typeof dragged?.['status'] === 'string' ? dragged['status'] : '';
    const current = this.scorecard.tickets().find((ticket) => ticket.id === id);
    if (!current || !isWorkflowStatus(target)) {
      args.cancel = true;
      this.boardRevision.update((value) => value + 1);
      return;
    }
    const from = workflowStatusOf(current);
    if (target === from) {
      return;
    }
    const roleCheck = canMoveWorkflowByRole(this.role(), from, target);
    if (!roleCheck.ok) {
      args.cancel = true;
      this.blockMessage.set(roleCheck.message);
      this.boardRevision.update((value) => value + 1);
      this.blockDialog?.open();
      return;
    }
    const result = moveWorkflow(current, target, todayInBangkok());
    if (!result.ok) {
      args.cancel = true;
      this.blockMessage.set(result.message);
      this.boardRevision.update((value) => value + 1);
      this.blockDialog?.open();
      return;
    }
    this.scorecard.replaceTicket(result.ticket);
    this.selectedId.set(result.ticket.id);
    const bounced = result.ticket.reopenCount > current.reopenCount;
    if (bounced) {
      this.notice.warning(`ตีกลับ ${result.ticket.id} แล้ว Reopen Count เป็น ${result.ticket.reopenCount}`);
    } else {
      this.notice.success(`ย้าย ${result.ticket.id} ไป ${target}`);
    }

    // Active WIP Detection for MD-DIRECT ticket entering In Progress
    if (result.ticket.isMdDirect && target === 'In Progress' && result.ticket.assigneeId) {
      const activeWips = this.scorecard
        .tickets()
        .filter(
          (t) =>
            t.id !== result.ticket.id &&
            t.assigneeId === result.ticket.assigneeId &&
            !t.closed &&
            !t.isPaused &&
            (workflowStatusOf(t) === 'In Progress' || workflowStatusOf(t) === 'Reopened'),
        );

      if (activeWips.length > 0) {
        this.pendingMdTicket.set(result.ticket);
        this.conflictingWipTickets.set(activeWips);
        const shiftDays = Math.max(1, Math.ceil(result.ticket.estimateMd || 1));
        this.mdShiftDays.set(shiftDays);
        this.mdShiftDialog?.show();
      }
    }
  }

  protected confirmMdShift(): void {
    const mdTicket = this.pendingMdTicket();
    const wips = this.conflictingWipTickets();
    const days = this.mdShiftDays();

    if (mdTicket && wips.length > 0) {
      const targetIds = wips.map((t) => t.id);
      void this.scorecard.applyMdMandateShift(mdTicket.id, targetIds, days).then((ok) => {
        if (ok) {
          this.notice.success(`พักงานเดิม ${wips.length} ใบ และเลื่อนวันส่งออกไป +${days} วันทำงานเรียบร้อยแล้ว`);
        }
      });
    }
    this.mdShiftDialog?.hide();
    this.pendingMdTicket.set(null);
    this.conflictingWipTickets.set([]);
  }

  protected skipMdShift(): void {
    this.mdShiftDialog?.hide();
    this.pendingMdTicket.set(null);
    this.conflictingWipTickets.set([]);
    this.notice.info('ดำเนินการต่อแบบทำคู่ขนาน (ไม่พักงานเดิม)');
  }

  protected resumePaused(ticketId: string): void {
    void this.scorecard.resumePausedTicket(ticketId).then((ok) => {
      if (ok) {
        this.notice.success(`ปลดพักงาน ${ticketId} และนำกลับเข้าสู่สถานะดำเนินงานเรียบร้อย`);
      }
    });
  }

  protected setDiscipline(event: { value?: string | null }): void {
    this.discipline.set(
      event.value && this.disciplineOptions.some((option) => option.value === event.value)
        ? (event.value as Discipline | '')
        : '',
    );
  }

  protected setCategory(event: { value?: string | null }): void {
    const value = event.value;
    const next =
      value && this.categoryOptions.some((option) => option.value === value) ? (value as WorkCategory | '') : '';
    this.workCategory.set(next);
    if (next !== 'R&D-PoC') {
      this.pocResult.set('');
    }
    if (!isBugCategory(next)) {
      this.bugCause.set('');
    }
  }

  protected setStory(event: { value?: string | null }): void {
    this.storyValue.set(event.value ?? '');
  }

  protected setDue(event: { value?: Date | null }): void {
    if (!this.dueLocked()) {
      this.due.set(event.value ?? null);
    }
  }

  protected setMr(event: { value?: string | null }): void {
    this.mrLink.set(event.value ?? '');
  }

  protected setPoc(event: { value?: string | null }): void {
    const value = event.value ?? '';
    this.pocResult.set(this.pocOptions.some((option) => option.value === value) ? (value as PocResult | '') : '');
  }

  protected setCause(event: { value?: string | null }): void {
    const value = event.value ?? '';
    this.bugCause.set(this.causeOptions.some((option) => option.value === value) ? (value as BugCause | '') : '');
  }

  protected saveFields(): void {
    const ticket = this.selected();
    if (!ticket) {
      return;
    }
    const allowPlanning = this.canEditPlanning();
    const parsed = this.storyValue() === '' ? null : Number(this.storyValue());
    const result = editWorkflow(ticket, {
      discipline: allowPlanning ? this.discipline() : (ticket.discipline ?? ''),
      workCategory: allowPlanning ? this.workCategory() : (ticket.workCategory ?? ''),
      storyPoints: allowPlanning ? (parsed as StoryPoint | null) : (ticket.storyPoints ?? null),
      firstDueOn:
        !allowPlanning || this.dueLocked() ? (ticket.firstDueOn ?? null) : toIsoDate(this.due()),
      mrLink: this.mrLink(),
      pocResult: this.pocResult(),
      bugCause: this.bugCause(),
    });
    if (!result.ok) {
      this.blockMessage.set(result.message);
      this.blockDialog?.open();
      return;
    }
    const finalTicket: Ticket = {
      ...result.ticket,
      isMdDirect: this.canEditPlanning() ? this.isMdDirect() : result.ticket.isMdDirect,
    };
    this.scorecard.replaceTicket(finalTicket);

    // If MD-DIRECT is checked and targets selected, execute auto-shift
    const shiftTargets = this.selectedShiftTargetIds();
    if (finalTicket.isMdDirect && shiftTargets.length > 0) {
      const shiftDays = Math.max(1, Math.ceil(finalTicket.estimateMd || 1));
      void this.scorecard.applyMdMandateShift(finalTicket.id, shiftTargets, shiftDays).then((ok) => {
        if (ok) {
          this.notice.success(`สั่ง Auto-Shift และพักงานเดิม ${shiftTargets.length} ใบ (+${shiftDays} วัน) เรียบร้อย`);
        }
      });
    }

    this.editDialog?.hide();
    this.notice.success(`บันทึกฟิลด์ ${ticket.id} แล้ว`);
  }

  protected bugCategory(): boolean {
    return isBugCategory(this.workCategory());
  }

  protected readonly isMdDirect = signal<boolean>(false);
  protected readonly selectedShiftTargetIds = signal<string[]>([]);
  protected readonly assigneeWipOptions = computed(() => {
    const ticket = this.selected();
    if (!ticket || !ticket.assigneeId) return [];
    return this.scorecard
      .tickets()
      .filter(
        (t) =>
          t.id !== ticket.id &&
          t.assigneeId === ticket.assigneeId &&
          !t.closed &&
          !t.isPaused &&
          (workflowStatusOf(t) === 'In Progress' || workflowStatusOf(t) === 'Reopened'),
      )
      .map((t) => ({
        id: t.id,
        text: `${t.id} · ${t.title || t.module} (ส่งเดิม: ${t.firstDueOn || '—'})`,
      }));
  });

  protected onMdDirectToggle(checked: boolean): void {
    this.isMdDirect.set(checked);
    if (checked) {
      // Pre-select all WIPs for auto-shift convenience
      const allIds = this.assigneeWipOptions().map((o) => o.id);
      this.selectedShiftTargetIds.set(allIds);
    } else {
      this.selectedShiftTargetIds.set([]);
    }
  }

  private fillForm(ticket: ReturnType<WorkBoard['selected']>): void {
    this.discipline.set(ticket?.discipline ?? '');
    this.workCategory.set(ticket?.workCategory ?? '');
    this.storyValue.set(ticket?.storyPoints ? String(ticket.storyPoints) : '');
    this.dueLocked.set(Boolean(ticket?.firstDueOn));
    this.due.set(toDate(ticket?.firstDueOn));
    this.mrLink.set(ticket?.mrLink ?? '');
    this.pocResult.set(ticket?.pocResult ?? '');
    this.bugCause.set(ticket?.bugCause ?? '');
    this.isMdDirect.set(Boolean(ticket?.isMdDirect));
    this.selectedShiftTargetIds.set([]);
  }
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function toIsoDate(value: Date | null): string | null {
  if (!value) {
    return null;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

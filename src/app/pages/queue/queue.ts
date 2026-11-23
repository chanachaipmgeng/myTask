import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { canAssignWork, weeklyQuotas } from '../../core/admin-settings';
import { ApiClient } from '../../core/api-client';
import { planNewWork, QueuePlan } from '../../core/capacity';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import {
  ConfirmDialogComponent,
  FlashMessagesComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
  SfMessageComponent,
  StatusBadgeComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    PageHeadComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    StatusBadgeComponent,
    FlashMessagesComponent,
    ConfirmDialogComponent,
    SfGridComponent,
    SfMessageComponent,
  ],
  templateUrl: './queue.html',
})
export class QueuePage {
  private readonly scorecard = inject(ScorecardService);
  private readonly workspace = inject(WorkspaceFilter);
  private readonly notice = inject(ShellNotice);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly api = inject(ApiClient, { optional: true });

  @ViewChild('writebackConfirm') private writebackConfirm?: ConfirmDialogComponent;

  protected readonly canAssign = canAssignWork;
  protected readonly capacityColumns: SfGridColumn[] = [
    { field: 'personLabel', headerText: 'พนักงาน', width: 220, cellType: 'person', personIdField: 'id' },
    { field: 'trackLabel', headerText: 'สาย', width: 120, cellType: 'badge' },
    { field: 'level', headerText: 'ระดับ', width: 105, cellType: 'badge' },
    { field: 'quota', headerText: 'โควต้า', width: 95, textAlign: 'Right', format: 'N1', cellType: 'metric' },
    { field: 'openMd', headerText: 'MD ที่เปิดอยู่', width: 120, textAlign: 'Right', format: 'N2', cellType: 'metric' },
    { field: 'freeMd', headerText: 'ว่างหลังกัน 1 MD', width: 145, textAlign: 'Right', format: 'N2', cellType: 'metric', suffix: ' MD' },
    { field: 'wipLabel', headerText: 'WIP', width: 85, textAlign: 'Center' },
    { field: 'xlLabel', headerText: 'XL', width: 75, textAlign: 'Center' },
    { field: 'status', headerText: 'สถานะ', width: 110, cellType: 'badge' },
  ];
  protected readonly capacityGridOptions: SfGridOptions = listGridOptions({
    id: 'queue-capacity-grid',
    height: '340',
    excelExport: true,
    csvExport: true,
    autoFreezeDesktop: 1,
    exportFileName: 'team-capacity',
  });
  protected readonly queueColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'รหัส', width: 125, cellType: 'ticket-link' },
    { field: 'type', headerText: 'ชนิด', width: 135, cellType: 'badge', badgeTone: 'secondary' },
    { field: 'module', headerText: 'โมดูล', width: 'auto', minWidth: 120 },
    { field: 'size', headerText: 'ขนาด', width: 80, cellType: 'badge', badgeTone: 'info' },
    { field: 'estimateMd', headerText: 'Est', width: 90, textAlign: 'Right', format: 'N2', cellType: 'metric', suffix: ' MD' },
    { field: 'assignee', headerText: 'ผู้รับ', width: 150 },
  ];
  protected readonly queueGridOptions: SfGridOptions = listGridOptions({
    height: '240',
  });
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly writebackEnabled = signal(false);
  protected readonly pendingAccept = signal<QueuePlan | null>(null);
  protected readonly accepting = signal(false);

  protected readonly writebackMessage = computed(() => {
    const item = this.pendingAccept();
    if (!item) {
      return '';
    }
    return `รับ ${item.ticket.id} ให้ ${item.personLabel} และ PATCH ผู้รับผิดชอบกลับ myProject (OpenProject) เพราะเปิด OPENPROJECT_WRITEBACK อยู่`;
  });

  private readonly scopedPeople = computed(() => this.workspace.applyToPeople(this.scorecard.roster()));

  protected readonly plan = computed(() =>
    planNewWork(
      this.scopedPeople(),
      this.scorecard.tickets(),
      { ...weeklyQuotas() },
      this.scorecard.leaves(),
    ),
  );
  protected readonly freePeople = computed(() => this.plan().rows.filter((row) => row.available));
  protected readonly freeChips = computed(() =>
    this.freePeople().map((person) => `${person.personLabel} ว่าง ${person.freeMd} MD`),
  );
  protected readonly implementQueue = computed(() => {
    const tracks = new Set(this.scopedPeople().map((person) => person.track));
    const teamScoped = !!this.workspace.teamId();
    return this.scorecard.ticketRows().filter((row) => {
      if (!row.unassigned || row.track !== 'Implement') {
        return false;
      }
      return !teamScoped || tracks.has('Implement') || tracks.has('IMP');
    });
  });
  protected readonly researchQueue = computed(() => {
    const tracks = new Set(this.scopedPeople().map((person) => person.track));
    const teamScoped = !!this.workspace.teamId();
    return this.scorecard.ticketRows().filter((row) => {
      if (!row.unassigned || row.track !== 'RD') {
        return false;
      }
      return !teamScoped || tracks.has('RD') || tracks.has('RND');
    });
  });

  constructor() {
    void this.loadWritebackFlag();
  }

  protected openTicket(id: string): void {
    if (id) {
      this.ticketDetail.open(id);
    }
  }

  protected accept(item: QueuePlan): void {
    if (!this.canAssign()) {
      this.error.set('เฉพาะ admin หรือ lead เท่านั้นที่รับข้อเสนอได้');
      this.message.set('');
      return;
    }
    const current = this.scorecard.workPlan().plans.find((plan) => plan.ticket.id === item.ticket.id);
    if (!current?.personId || current.personId !== item.personId) {
      this.message.set('');
      this.error.set('โควตาเปลี่ยนแล้ว ใบนี้ยังไม่ถูกย้าย');
      return;
    }

    const needsConfirm = this.writebackEnabled() && typeof item.ticket.opId === 'number';
    if (needsConfirm) {
      this.pendingAccept.set(item);
      this.writebackConfirm?.open();
      return;
    }
    void this.runAssign(item);
  }

  protected acceptAsMdDirect(item: QueuePlan): void {
    if (!this.canAssign()) {
      this.error.set('เฉพาะ admin หรือ lead เท่านั้นที่สั่งจ่ายงานด่วน MD ได้');
      this.message.set('');
      return;
    }
    if (!item.personId) return;

    this.accepting.set(true);
    this.error.set('');

    void (async () => {
      try {
        // 1. Assign ticket
        const assignRes = await this.scorecard.assignTicket(item.ticket.id, item.personId!);
        if (!assignRes.ok) {
          const text = assignRes.message ?? 'ยังไม่ย้ายใบ';
          this.error.set(text);
          this.notice.error(text);
          return;
        }

        // 2. Mark ticket as isMdDirect
        const currentTicket = this.scorecard.tickets().find((t) => t.id === item.ticket.id);
        if (currentTicket) {
          const mdTicket = { ...currentTicket, isMdDirect: true };
          this.scorecard.replaceTicket(mdTicket);

          // 3. Detect and Auto-Shift WIP tickets of assignee
          const shiftDays = Math.max(1, Math.ceil(mdTicket.estimateMd || 1));
          const wips = this.scorecard
            .tickets()
            .filter(
              (t) =>
                t.id !== mdTicket.id &&
                t.assigneeId === item.personId &&
                !t.closed &&
                !t.isPaused &&
                (t.workflowStatus === 'In Progress' || t.workflowStatus === 'Reopened'),
            );

          if (wips.length > 0) {
            const targetIds = wips.map((w) => w.id);
            await this.scorecard.applyMdMandateShift(mdTicket.id, targetIds, shiftDays);
            this.notice.success(
              `รับงานด่วน MD ${mdTicket.id} ให้ ${item.personLabel} และเลื่อนงานเดิม ${wips.length} ใบ (+${shiftDays} วัน) แล้ว`,
            );
            this.message.set(
              `รับงานด่วน MD ${mdTicket.id} ให้ ${item.personLabel} สำเร็จ พร้อมสั่งพักและเลื่อนวันส่งงานเดิม ${wips.length} ใบ (+${shiftDays} วัน)`,
            );
          } else {
            this.notice.success(`รับงานด่วน MD ${mdTicket.id} ให้ ${item.personLabel} เรียบร้อย (ไม่มีงานค้างต้องเลื่อน)`);
            this.message.set(`รับงานด่วน MD ${mdTicket.id} ให้ ${item.personLabel} เรียบร้อย`);
          }
        }
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : String(err));
      } finally {
        this.accepting.set(false);
      }
    })();
  }

  protected confirmWriteback(): void {
    const item = this.pendingAccept();
    this.pendingAccept.set(null);
    if (item) {
      void this.runAssign(item);
    }
  }

  protected cancelWriteback(): void {
    this.pendingAccept.set(null);
  }

  private async runAssign(item: QueuePlan): Promise<void> {
    this.accepting.set(true);
    this.error.set('');
    try {
      const result = await this.scorecard.assignTicket(item.ticket.id, item.personId!);
      if (!result.ok) {
        const text = result.message ?? 'ยังไม่ย้ายใบ';
        this.message.set('');
        this.error.set(text);
        this.notice.error(text);
        return;
      }
      let text = `รับ ${item.ticket.id} ให้ ${item.personLabel} แล้ว`;
      if (result.writebackError) {
        text += ` · เขียนกลับ OpenProject ไม่สำเร็จ: ${result.writebackError}`;
        this.error.set(result.writebackError);
        this.message.set(text);
        this.notice.warning(text);
        return;
      }
      this.error.set('');
      this.message.set(text);
      this.notice.success(text);
    } finally {
      this.accepting.set(false);
    }
  }

  private async loadWritebackFlag(): Promise<void> {
    if (!this.api) {
      this.writebackEnabled.set(false);
      return;
    }
    try {
      const info = await this.api.getOpenProject();
      this.writebackEnabled.set(!!info.writeback);
    } catch {
      this.writebackEnabled.set(false);
    }
  }
}

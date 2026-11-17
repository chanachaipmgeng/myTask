import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { ButtonModule, ChipListModule } from '@syncfusion/ej2-angular-buttons';
import { FilterService, GridModule, PageService, SortService } from '@syncfusion/ej2-angular-grids';
import { ToolbarModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { canAssignWork } from '../../core/admin-settings';
import { ApiClient } from '../../core/api-client';
import { QueuePlan } from '../../core/capacity';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FlashMessagesComponent } from '../../shared/ui/flash-messages/flash-messages';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';

@Component({
  selector: 'app-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GridModule,
    ToolbarModule,
    ButtonModule,
    ChipListModule,
    MessageModule,
    PageHeadComponent,
    SectionCardComponent,
    FlashMessagesComponent,
    ConfirmDialogComponent,
  ],
  providers: [PageService, SortService, FilterService],
  templateUrl: './queue.html',
})
export class QueuePage {
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  private readonly api = inject(ApiClient, { optional: true });

  @ViewChild('writebackConfirm') private writebackConfirm?: ConfirmDialogComponent;

  protected readonly canAssign = canAssignWork;
  protected readonly pageSettings = { pageSize: 8 };
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

  protected readonly plan = this.scorecard.workPlan;
  protected readonly freePeople = computed(() => this.plan().rows.filter((row) => row.available));
  protected readonly freeChips = computed(() =>
    this.freePeople().map((person) => `${person.personLabel} ว่าง ${person.freeMd} MD`),
  );
  protected readonly implementQueue = computed(() =>
    this.scorecard.ticketRows().filter((row) => row.unassigned && row.track === 'Implement'),
  );
  protected readonly researchQueue = computed(() =>
    this.scorecard.ticketRows().filter((row) => row.unassigned && row.track === 'RD'),
  );

  constructor() {
    void this.loadWritebackFlag();
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

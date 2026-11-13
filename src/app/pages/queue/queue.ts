import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { ButtonModule, ChipListModule } from '@syncfusion/ej2-angular-buttons';
import { FilterService, GridModule, PageService, SortService } from '@syncfusion/ej2-angular-grids';
import { ToolbarModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { DialogComponent, DialogModule } from '@syncfusion/ej2-angular-popups';
import { canAssignWork } from '../../core/admin-settings';
import { ApiClient } from '../../core/api-client';
import { QueuePlan } from '../../core/capacity';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';

@Component({
  selector: 'app-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GridModule, ToolbarModule, ButtonModule, ChipListModule, MessageModule, DialogModule],
  providers: [PageService, SortService, FilterService],
  templateUrl: './queue.html',
})
export class QueuePage {
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  private readonly api = inject(ApiClient, { optional: true });

  @ViewChild('writebackDialog') private writebackDialog?: DialogComponent;

  protected readonly canAssign = canAssignWork;
  protected readonly pageSettings = { pageSize: 8 };
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly writebackEnabled = signal(false);
  protected readonly pendingAccept = signal<QueuePlan | null>(null);
  protected readonly accepting = signal(false);

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
      this.writebackDialog?.show();
      return;
    }
    void this.runAssign(item);
  }

  protected confirmWriteback(): void {
    const item = this.pendingAccept();
    this.writebackDialog?.hide();
    this.pendingAccept.set(null);
    if (item) {
      void this.runAssign(item);
    }
  }

  protected cancelWriteback(): void {
    this.writebackDialog?.hide();
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
        this.notice.show(text);
        return;
      }
      let text = `รับ ${item.ticket.id} ให้ ${item.personLabel} แล้ว`;
      if (result.writebackError) {
        text += ` · เขียนกลับ OpenProject ไม่สำเร็จ: ${result.writebackError}`;
        this.error.set(result.writebackError);
      } else {
        this.error.set('');
      }
      this.message.set(text);
      this.notice.show(text);
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

import { Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { FilterService, GridModule, PageService, SortService } from '@syncfusion/ej2-angular-grids';
import { ToolbarModule } from '@syncfusion/ej2-angular-navigations';
import { QueuePlan } from '../../core/capacity';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';

@Component({
  selector: 'app-queue',
  imports: [GridModule, ToolbarModule, ButtonModule],
  providers: [PageService, SortService, FilterService],
  templateUrl: './queue.html',
})
export class QueuePage {
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);

  protected readonly pageSettings = { pageSize: 8 };
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly plan = this.scorecard.workPlan;
  protected readonly freePeople = computed(() => this.plan().rows.filter((row) => row.available));
  protected readonly implementQueue = computed(() =>
    this.scorecard.ticketRows().filter((row) => row.unassigned && row.track === 'Implement'),
  );
  protected readonly researchQueue = computed(() =>
    this.scorecard.ticketRows().filter((row) => row.unassigned && row.track === 'RD'),
  );

  protected accept(item: QueuePlan): void {
    const current = this.scorecard.workPlan().plans.find((plan) => plan.ticket.id === item.ticket.id);
    if (!current?.personId || current.personId !== item.personId) {
      this.message.set('');
      this.error.set('โควตาเปลี่ยนแล้ว ใบนี้ยังไม่ถูกย้าย');
      return;
    }
    const accepted = this.scorecard.assignTicket(item.ticket.id, item.personId);
    this.error.set('');
    const text = accepted ? `รับ ${item.ticket.id} ให้ ${item.personLabel} แล้ว` : 'ยังไม่ย้ายใบ';
    this.message.set(text);
    this.notice.show(text);
  }
}

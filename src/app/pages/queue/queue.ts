import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { canAssignWork, effectiveRole, weeklyQuotas } from '../../core/admin-settings';
import { ApiClient } from '../../core/api-client';
import { planNewWork, QueuePlan } from '../../core/capacity';
import { normalizeTrack } from '../../core/models';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import {
  ConfirmDialogComponent,
  FilterChipOption,
  FilterChipsComponent,
  FlashMessagesComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  StatusBadgeComponent,
  WorkspaceAsidebarComponent,
} from '../../shared/ui';
import {
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
} from '../../shared/sf/sf-grid/sf-grid';
import { SfMessageComponent } from '../../shared/sf/sf-message/sf-message';

@Component({
  selector: 'app-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    FilterChipsComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    StatusBadgeComponent,
    FlashMessagesComponent,
    ConfirmDialogComponent,
    WorkspaceAsidebarComponent,
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
    id: 'queue-capacity-grid-v2',
    height: '340',
    filtering: 'Excel',
    columnChooser: true,
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
    id: 'queue-unassigned-grid-v3',
    height: '280',
    paging: true,
    pageSize: 15,
    pageSizes: [15, 30, 50],
    filtering: 'Excel',
    columnChooser: true,
    excelExport: true,
    csvExport: true,
    exportFileName: 'work-queue',
  });
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly writebackEnabled = signal(false);
  protected readonly pendingAccept = signal<QueuePlan | null>(null);
  protected readonly accepting = signal(false);
  protected readonly planLimit = signal(30);

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
    const tracks = new Set(this.scopedPeople().map((person) => normalizeTrack(person.track)));
    const teamScoped = !!this.workspace.teamId();
    return this.scorecard
      .ticketRows()
      .filter((row) => {
        const canonical = normalizeTrack(row.track);
        if (!row.unassigned || canonical === 'RND') {
          return false;
        }
        return !teamScoped || tracks.has(canonical);
      })
      .slice(0, 150);
  });
  protected readonly researchQueue = computed(() => {
    const tracks = new Set(this.scopedPeople().map((person) => normalizeTrack(person.track)));
    const teamScoped = !!this.workspace.teamId();
    return this.scorecard
      .ticketRows()
      .filter((row) => {
        if (!row.unassigned || normalizeTrack(row.track) !== 'RND') {
          return false;
        }
        return !teamScoped || tracks.has('RND');
      })
      .slice(0, 150);
  });

  protected readonly activeQueueTab = signal<'proposals' | 'implement' | 'research' | 'capacity'>('proposals');
  protected readonly planPage = signal<number>(1);
  protected readonly planPageSize = 10;

  protected readonly queueTabOptions = computed<FilterChipOption[]>(() => [
    { id: 'proposals', label: 'ข้อเสนอจ่ายงาน', count: this.allOrderedPlans().length },
    { id: 'implement', label: 'คิว Implement', count: this.implementQueue().length },
    { id: 'research', label: 'คิว R&D', count: this.researchQueue().length },
    { id: 'capacity', label: 'ตารางกำลังคน', count: this.plan().rows.length },
  ]);

  protected readonly actionablePlans = computed(() =>
    this.plan().plans.filter((p) => p.personId != null),
  );
  protected readonly backlogPlans = computed(() =>
    this.plan().plans.filter((p) => p.personId == null),
  );
  protected readonly allOrderedPlans = computed(() => [
    ...this.actionablePlans(),
    ...this.backlogPlans(),
  ]);
  protected readonly planTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.allOrderedPlans().length / this.planPageSize)),
  );
  protected readonly pagedPlans = computed(() => {
    const page = Math.min(this.planPage(), this.planTotalPages());
    const start = (page - 1) * this.planPageSize;
    return this.allOrderedPlans().slice(start, start + this.planPageSize);
  });
  protected readonly displayPlans = computed(() => this.pagedPlans());
  protected readonly hasMoreBacklog = computed(
    () => this.planPage() < this.planTotalPages(),
  );

  protected setQueueTab(id: string): void {
    if (id === 'proposals' || id === 'implement' || id === 'research' || id === 'capacity') {
      this.activeQueueTab.set(id);
    }
  }

  protected setPlanPage(page: number): void {
    if (page >= 1 && page <= this.planTotalPages()) {
      this.planPage.set(page);
    }
  }

  protected loadMorePlans(): void {
    this.setPlanPage(this.planPage() + 1);
  }

  constructor() {
    void this.scorecard.whenReady().then(() => this.loadWritebackFlag());
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
    const current = this.plan().plans.find((plan) => plan.ticket.id === item.ticket.id);
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
            const shiftOk = await this.scorecard.applyMdMandateShift(mdTicket.id, targetIds, shiftDays);
            if (!shiftOk) {
              this.error.set('จ่ายงานด่วนแล้ว แต่เลื่อนกำหนดส่งงานเดิมไม่สำเร็จ');
              return;
            }
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
    if (!this.api || !this.scorecard.usingApi() || effectiveRole() === 'member') {
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

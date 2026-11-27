import { ChangeDetectionStrategy, Component, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DragEventArgs } from '@syncfusion/ej2-kanban';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import { SfDatePickerComponent } from '../../shared/sf/sf-datepicker/sf-datepicker';
import { SfDialogComponent } from '../../shared/sf/sf-dialog/sf-dialog';
import { SfDropdownComponent } from '../../shared/sf/sf-dropdown/sf-dropdown';
import { SfKanbanComponent } from '../../shared/sf/sf-kanban/sf-kanban';
import { SfProgressComponent } from '../../shared/sf/sf-progress/sf-progress';
import { SfTextBoxComponent } from '../../shared/sf/sf-textbox/sf-textbox';
import {
  BUG_CAUSES,
  BugCause,
  DISCIPLINES,
  Discipline,
  POC_RESULTS,
  PocResult,
  STORY_POINTS,
  StoryPoint,
  Track,
  WORK_CATEGORIES,
  WORKFLOW_STATUSES,
  WorkCategory,
} from '../../core/models';
import {
  CATEGORY_LABELS,
  DISCIPLINE_LABELS,
  editWorkflow,
  isBugCategory,
  isWorkflowStatus,
  moveWorkflow,
  pipelineReport,
  todayInBangkok,
  workflowStatusOf,
} from '../../core/workflow';

type TrackFilter = Track | 'All';

@Component({
  selector: 'app-pipeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    SfDatePickerComponent,
    SfDialogComponent,
    SfDropdownComponent,
    SfKanbanComponent,
    SfProgressComponent,
    SfTextBoxComponent,
  ],
  templateUrl: './pipeline.html',
})
export class PipelinePage {
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  protected readonly theme = inject(ThemeService);
  private readonly boardRevision = signal(0);

  @ViewChild('blockDialog') private blockDialog?: SfDialogComponent;

  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly columns = WORKFLOW_STATUSES.map((status) => ({
    headerText: status,
    keyField: status,
    showItemCount: true,
    showAddButton: false,
  }));
  protected readonly cardSettings = { headerField: 'id', contentField: 'summary' };
  protected readonly trackOptions = [
    { text: 'R&D', value: 'RD' },
    { text: 'Implement', value: 'Implement' },
    { text: 'ทุกสาย', value: 'All' },
  ];
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
  protected readonly barAnimation = { enable: false };
  protected readonly barLabel = { color: '#e8f4fb', fontFamily: 'Sarabun, sans-serif', size: '13px' };

  protected readonly trackFilter = signal<TrackFilter>('RD');
  protected readonly selectedId = signal<string | null>('RD-OPEN');
  protected readonly blockMessage = signal('');

  protected readonly discipline = signal<string>('');
  protected readonly workCategory = signal<string>('');
  protected readonly storyValue = signal('');
  protected readonly due = signal<Date | null>(null);
  protected readonly dueLocked = signal(false);
  protected readonly mrLink = signal('');
  protected readonly pocResult = signal<string>('');
  protected readonly bugCause = signal<string>('');

  protected readonly visibleTickets = computed(() => {
    const track = this.trackFilter();
    return this.scorecard.tickets().filter((ticket) => track === 'All' || ticket.track === track);
  });

  protected readonly cards = computed(() => {
    this.boardRevision();
    const names = new Map(this.scorecard.people().map((person) => [person.id, person.nickname]));
    return this.visibleTickets().map((ticket) => ({
      id: ticket.id,
      status: workflowStatusOf(ticket),
      summary: `${ticket.module} · ${names.get(ticket.assigneeId) ?? 'ยังไม่มีผู้รับ'} · ${ticket.storyPoints ?? '—'} pts`,
    }));
  });

  protected readonly report = computed(() => pipelineReport(this.visibleTickets(), this.scorecard.people()));

  protected readonly selected = computed(
    () => this.scorecard.tickets().find((ticket) => ticket.id === this.selectedId()) ?? null,
  );

  constructor() {
    effect(() => {
      this.fillForm(this.selected());
    });
  }

  protected setTrack(value: string): void {
    if (value === 'All' || value === 'Implement' || value === 'RD') {
      this.trackFilter.set(value);
    }
  }

  protected onCardClick(args: { data?: Record<string, any> }): void {
    const id = args.data?.['id'];
    if (typeof id === 'string' && id) {
      this.selectedId.set(id);
    }
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
    if (target === workflowStatusOf(current)) {
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
  }

  protected setDiscipline(val: string): void {
    this.discipline.set(val ?? '');
  }

  protected setCategory(val: string): void {
    const next = val ?? '';
    this.workCategory.set(next);
    if (next !== 'R&D-PoC') {
      this.pocResult.set('');
    }
    if (!isBugCategory(next)) {
      this.bugCause.set('');
    }
  }

  protected setStory(val: string): void {
    this.storyValue.set(val ?? '');
  }

  protected setDueIso(iso: string): void {
    if (!this.dueLocked()) {
      this.due.set(toDate(iso));
    }
  }

  protected setMr(val: string): void {
    this.mrLink.set(val ?? '');
  }

  protected setPoc(val: string): void {
    this.pocResult.set(val ?? '');
  }

  protected setCause(val: string): void {
    this.bugCause.set(val ?? '');
  }

  protected saveFields(): void {
    const ticket = this.selected();
    if (!ticket) {
      return;
    }
    const parsed = this.storyValue() === '' ? null : Number(this.storyValue());
    const result = editWorkflow(ticket, {
      discipline: this.discipline(),
      workCategory: this.workCategory(),
      storyPoints: parsed as StoryPoint | null,
      firstDueOn: this.dueLocked() ? (ticket.firstDueOn ?? null) : toIsoDate(this.due()),
      mrLink: this.mrLink(),
      pocResult: this.pocResult(),
      bugCause: this.bugCause(),
    });
    if (!result.ok) {
      this.blockMessage.set(result.message);
      this.blockDialog?.open();
      return;
    }
    this.scorecard.replaceTicket(result.ticket);
    this.notice.success(`บันทึกฟิลด์ ${ticket.id} แล้ว`);
  }

  protected bugCategory(): boolean {
    return isBugCategory(this.workCategory());
  }

  private fillForm(ticket: ReturnType<PipelinePage['selected']>): void {
    this.discipline.set(ticket?.discipline ?? '');
    this.workCategory.set(ticket?.workCategory ?? '');
    this.storyValue.set(ticket?.storyPoints ? String(ticket.storyPoints) : '');
    this.dueLocked.set(Boolean(ticket?.firstDueOn));
    this.due.set(toDate(ticket?.firstDueOn));
    this.mrLink.set(ticket?.mrLink ?? '');
    this.pocResult.set(ticket?.pocResult ?? '');
    this.bugCause.set(ticket?.bugCause ?? '');
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

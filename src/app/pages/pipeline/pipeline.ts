import { Component, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DatePickerModule } from '@syncfusion/ej2-angular-calendars';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { KanbanModule } from '@syncfusion/ej2-angular-kanban';
import { DialogComponent, DialogModule } from '@syncfusion/ej2-angular-popups';
import { ProgressBarModule } from '@syncfusion/ej2-angular-progressbar';
import { DragEventArgs } from '@syncfusion/ej2-kanban';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
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
  imports: [
    KanbanModule,
    ProgressBarModule,
    DialogModule,
    DropDownListModule,
    DatePickerModule,
    TextBoxModule,
    ButtonModule,
  ],
  templateUrl: './pipeline.html',
})
export class PipelinePage {
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  private readonly boardRevision = signal(0);

  @ViewChild('blockDialog') private blockDialog?: DialogComponent;

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

  protected discipline: Discipline | '' = '';
  protected workCategory: WorkCategory | '' = '';
  protected storyValue = '';
  protected due: Date | null = null;
  protected dueLocked = false;
  protected mrLink = '';
  protected pocResult: PocResult | '' = '';
  protected bugCause: BugCause | '' = '';

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

  protected setTrack(event: { value?: string | null }): void {
    const value = event.value;
    if (value === 'All' || value === 'Implement' || value === 'RD') {
      this.trackFilter.set(value);
    }
  }

  protected onCardClick(args: { data?: { id?: string } }): void {
    const id = args.data?.id;
    if (id) {
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
      this.blockDialog?.show();
      return;
    }
    this.scorecard.replaceTicket(result.ticket);
    this.selectedId.set(result.ticket.id);
    const bounced = result.ticket.reopenCount > current.reopenCount;
    this.notice.show(
      bounced
        ? `ตีกลับ ${result.ticket.id} แล้ว Reopen Count เป็น ${result.ticket.reopenCount}`
        : `ย้าย ${result.ticket.id} ไป ${target}`,
    );
  }

  protected setDiscipline(event: { value?: string | null }): void {
    this.discipline = event.value && this.disciplineOptions.some((option) => option.value === event.value)
      ? (event.value as Discipline | '')
      : '';
  }

  protected setCategory(event: { value?: string | null }): void {
    const value = event.value;
    this.workCategory = value && this.categoryOptions.some((option) => option.value === value)
      ? (value as WorkCategory | '')
      : '';
    if (this.workCategory !== 'R&D-PoC') {
      this.pocResult = '';
    }
    if (!isBugCategory(this.workCategory)) {
      this.bugCause = '';
    }
  }

  protected setStory(event: { value?: string | null }): void {
    this.storyValue = event.value ?? '';
  }

  protected setDue(event: { value?: Date | null }): void {
    if (!this.dueLocked) {
      this.due = event.value ?? null;
    }
  }

  protected setMr(event: { value?: string | null }): void {
    this.mrLink = event.value ?? '';
  }

  protected setPoc(event: { value?: string | null }): void {
    const value = event.value ?? '';
    this.pocResult = this.pocOptions.some((option) => option.value === value) ? (value as PocResult | '') : '';
  }

  protected setCause(event: { value?: string | null }): void {
    const value = event.value ?? '';
    this.bugCause = this.causeOptions.some((option) => option.value === value) ? (value as BugCause | '') : '';
  }

  protected saveFields(): void {
    const ticket = this.selected();
    if (!ticket) {
      return;
    }
    const parsed = this.storyValue === '' ? null : Number(this.storyValue);
    const result = editWorkflow(ticket, {
      discipline: this.discipline,
      workCategory: this.workCategory,
      storyPoints: parsed as StoryPoint | null,
      firstDueOn: this.dueLocked ? (ticket.firstDueOn ?? null) : toIsoDate(this.due),
      mrLink: this.mrLink,
      pocResult: this.pocResult,
      bugCause: this.bugCause,
    });
    if (!result.ok) {
      this.blockMessage.set(result.message);
      this.blockDialog?.show();
      return;
    }
    this.scorecard.replaceTicket(result.ticket);
    this.notice.show(`บันทึกฟิลด์ ${ticket.id} แล้ว`);
  }

  protected bugCategory(): boolean {
    return isBugCategory(this.workCategory);
  }

  private fillForm(ticket: ReturnType<PipelinePage['selected']>): void {
    this.discipline = ticket?.discipline ?? '';
    this.workCategory = ticket?.workCategory ?? '';
    this.storyValue = ticket?.storyPoints ? String(ticket.storyPoints) : '';
    this.dueLocked = Boolean(ticket?.firstDueOn);
    this.due = toDate(ticket?.firstDueOn);
    this.mrLink = ticket?.mrLink ?? '';
    this.pocResult = ticket?.pocResult ?? '';
    this.bugCause = ticket?.bugCause ?? '';
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

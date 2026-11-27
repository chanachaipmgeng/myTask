import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { MockSession, mockPersonIndexes } from '../../core/mock-session';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import { PageHeadComponent, SectionCardComponent } from '../../shared/ui';
import { SfGridColumn, SfGridComponent, SfGridOptions } from '../../shared/sf/sf-grid/sf-grid';
import { SfMessageComponent } from '../../shared/sf/sf-message/sf-message';
import { SfProgressComponent } from '../../shared/sf/sf-progress/sf-progress';
import { SfStepperComponent } from '../../shared/sf/sf-stepper/sf-stepper';

@Component({
  selector: 'app-mockup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    RouterLink,
    PageHeadComponent,
    SectionCardComponent,
    SfGridComponent,
    SfMessageComponent,
    SfProgressComponent,
    SfStepperComponent,
  ],
  templateUrl: './mockup.html',
  styleUrl: './mockup.scss',
})
export class MockupPage {
  private readonly session = inject(MockSession);
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  protected readonly theme = inject(ThemeService);

  protected readonly draftColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'ใบ', width: 140 },
    { field: 'title', headerText: 'เรื่อง', width: 200 },
    { field: 'size', headerText: 'ขนาด', width: 80 },
    { field: 'estimateMd', headerText: 'Est MD', width: 90, textAlign: 'Right', cellType: 'metric', format: 'N2' },
    { field: 'rubricTotal', headerText: 'รูบริก', width: 90, textAlign: 'Right', cellType: 'metric', format: 'N0' },
    { field: 'late', headerText: 'แผน', width: 100, cellType: 'badge' },
    { field: 'note', headerText: 'หมายเหตุ', width: 180 },
  ];
  protected readonly capacityColumns: SfGridColumn[] = [
    { field: 'personLabel', headerText: 'คน', width: 180, cellType: 'person' },
    { field: 'trackLabel', headerText: 'สาย', width: 110, cellType: 'badge' },
    { field: 'quota', headerText: 'โควต้า', width: 90, textAlign: 'Right', cellType: 'metric', format: 'N1' },
    { field: 'openMd', headerText: 'เปิดอยู่', width: 100, textAlign: 'Right', cellType: 'metric', format: 'N2' },
    { field: 'freeMd', headerText: 'ว่าง', width: 90, textAlign: 'Right', cellType: 'metric', format: 'N2' },
    { field: 'wipLabel', headerText: 'WIP', width: 85, cellType: 'code' },
    { field: 'status', headerText: 'สถานะ', width: 105, cellType: 'badge' },
  ];
  protected readonly scoreColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'ใบ', width: 135, cellType: 'ticket-link' },
    { field: 'title', headerText: 'เรื่อง', width: 180 },
    { field: 'assignee', headerText: 'ผู้รับ', width: 130, cellType: 'person' },
    { field: 'size', headerText: 'ขนาด', width: 80, cellType: 'badge' },
    { field: 'estimateMd', headerText: 'Est', width: 80, textAlign: 'Right', cellType: 'metric', format: 'N2' },
    { field: 'actualMd', headerText: 'Actual', width: 90, textAlign: 'Right', cellType: 'metric', format: 'N2' },
    { field: 'weekOffset', headerText: 'เลื่อน', width: 80, textAlign: 'Right', cellType: 'delta' },
    { field: 'score', headerText: 'คะแนน', width: 90, textAlign: 'Right', cellType: 'score' },
    { field: 'spikeScore', headerText: 'Spike', width: 85, textAlign: 'Right', cellType: 'metric', format: 'N1' },
  ];
  protected readonly personIndexColumns: SfGridColumn[] = [
    { field: 'name', headerText: 'คน', width: 160, cellType: 'person' },
    { field: 'index', headerText: 'ดัชนี', width: 100, textAlign: 'Right', cellType: 'score' },
  ];
  protected readonly logColumns: SfGridColumn[] = [
    { field: 'stepNo', headerText: 'ลำดับ', width: 90, textAlign: 'Right', cellType: 'metric', format: 'N0' },
    { field: 'entry', headerText: 'รายละเอียดขั้นที่จำลอง', width: 520 },
  ];
  protected readonly pagedGridOptions: SfGridOptions = { paging: true, pageSize: 8, sorting: true, resizable: true, height: '260' };
  protected readonly compactGridOptions: SfGridOptions = { paging: true, pageSize: 10, sorting: true, resizable: true, height: '220' };
  protected readonly active = this.session.active;
  protected readonly step = this.session.step;
  protected readonly steps = this.session.steps;
  protected readonly currentStep = this.session.currentStep;
  protected readonly message = this.session.message;
  protected readonly log = this.session.log;
  protected readonly drafts = this.session.drafts;
  protected readonly sprint = this.session.sprint;
  protected readonly capacityRows = this.session.capacityRows;
  protected readonly scoreSummary = this.session.scoreSummary;
  protected readonly finished = this.session.finished;
  protected readonly progress = computed(() => {
    const total = this.steps.length;
    const done = Math.min(this.step(), total);
    return Math.round((done / total) * 100);
  });
  protected readonly stepperSteps = computed(() => {
    const current = this.step();
    return this.steps.map((item, idx) => ({
      text: String(idx + 1),
      label: item.title,
      status: current > idx ? 'Completed' : current === idx && this.active() ? 'InProgress' : 'NotStarted',
    }));
  });
  protected readonly logRows = computed(() =>
    this.log().map((entry, idx) => ({
      stepNo: idx + 1,
      entry,
    })),
  );
  protected readonly personIndexes = computed(() =>
    mockPersonIndexes(this.scorecard.people(), this.scorecard.tickets()),
  );
  protected readonly draftRows = computed(() =>
    this.drafts().map((draft) => ({
      id: draft.blueprint.id,
      title: draft.blueprint.title,
      size: draft.size,
      estimateMd: draft.estimateMd,
      rubricTotal: draft.rubricTotal,
      late: draft.blueprint.lateEntry ? 'นอกแผน' : 'ในแผน',
      note: draft.blueprint.note,
    })),
  );

  protected enter(): void {
    const result = this.session.enter();
    this.notice.show(result.message);
  }

  protected runStep(): void {
    if (!this.active()) {
      this.enter();
    }
    const result = this.session.runStep();
    this.notice.show(result.message);
  }

  protected playAll(): void {
    const result = this.session.playAll();
    this.notice.show(result.message);
  }

  protected exit(): void {
    const result = this.session.exit();
    this.notice.show(result.message);
  }
}

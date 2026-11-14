import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { GridModule, PageService, ResizeService, SortService } from '@syncfusion/ej2-angular-grids';
import { StepperModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { ProgressBarModule } from '@syncfusion/ej2-angular-progressbar';
import { MockSession, mockPersonIndexes } from '../../core/mock-session';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';

@Component({
  selector: 'app-mockup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, GridModule, MessageModule, ProgressBarModule, StepperModule, RouterLink],
  providers: [PageService, SortService, ResizeService],
  templateUrl: './mockup.html',
  styleUrl: './mockup.scss',
})
export class MockupPage {
  private readonly session = inject(MockSession);
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);

  protected readonly pageSettings = { pageSize: 8 };
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
      label: `${idx + 1}. ${item.title}`,
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

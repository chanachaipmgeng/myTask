import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  CategoryService,
  ChartModule,
  LegendService,
  LineSeriesService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { AggregateService, GridModule, PageService, ResizeService, SortService } from '@syncfusion/ej2-angular-grids';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { ProgressBarModule } from '@syncfusion/ej2-angular-progressbar';
import { currentViewer, effectiveRole, trackWeights, weeklyQuotas } from '../../core/admin-settings';
import { buildAnalyticsReport } from '../../core/analytics';
import { personDashboard } from '../../core/person-dashboard';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';

@Component({
  selector: 'app-my-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    ChartModule,
    GridModule,
    MessageModule,
    ProgressBarModule,
    RouterLink,
  ],
  providers: [
    CategoryService,
    LineSeriesService,
    LegendService,
    TooltipService,
    PageService,
    SortService,
    ResizeService,
    AggregateService,
  ],
  templateUrl: './my-workspace.html',
})
export class MyWorkspacePage {
  private readonly scorecard = inject(ScorecardService);

  protected readonly role = effectiveRole;
  protected readonly pageSettings = { pageSize: 6 };
  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px', color: '#d7e7f5' };
  protected readonly categoryAxis = {
    valueType: 'Category',
    majorGridLines: { width: 0 },
    labelStyle: this.axisFont,
  };
  protected readonly indexAxis = {
    minimum: 0,
    maximum: 100,
    title: 'ดัชนีพัฒนาของฉัน',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };
  protected readonly tooltip = { enable: true, shared: true };
  protected readonly legend = { visible: true, position: 'Top', textStyle: this.axisFont };
  protected readonly chartArea = { border: { width: 0 } };
  protected readonly marker = { visible: true, width: 8, height: 8 };

  protected readonly activePerson = computed(() => {
    const sess = currentSession();
    const id = sess?.person.id ?? currentViewer().id;
    return this.scorecard.roster().find((p) => p.id === id) ?? this.scorecard.roster()[0];
  });

  protected readonly view = computed(() => {
    const person = this.activePerson();
    return personDashboard(person, this.scorecard.tickets(), {
      weights: trackWeights(),
      quota: person ? weeklyQuotas()[person.level] : undefined,
    });
  });

  protected readonly analytics = computed(() =>
    buildAnalyticsReport(this.scorecard.roster(), this.scorecard.tickets()),
  );

  protected readonly myCoaching = computed(() => {
    const id = this.activePerson()?.id ?? '';
    return this.analytics().coachingInsights.find((item) => item.personId === id) ?? null;
  });

  protected readonly myRisks = computed(() => {
    const id = this.activePerson()?.id ?? '';
    return this.analytics().deliveryRisks.filter((item) => item.assigneeId === id);
  });

  protected readonly freeMdLabel = computed(() => {
    const person = this.activePerson();
    if (!person) return '0.0';
    const quota = weeklyQuotas()[person.level];
    const openMd = this.view().openWork.reduce((sum, item) => sum + item.estimateMd, 0);
    const free = Math.max(0, quota - openMd - 1);
    return free.toFixed(2);
  });
}

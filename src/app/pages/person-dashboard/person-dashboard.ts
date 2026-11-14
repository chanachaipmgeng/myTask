import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  AccumulationChartModule,
  AccumulationDataLabelService,
  AccumulationLegendService,
  AccumulationTooltipService,
  CategoryService,
  ChartModule,
  ColumnSeriesService,
  LegendService,
  LineSeriesService,
  PieSeriesService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { AggregateService, GridModule, PageService, ResizeService, SortService } from '@syncfusion/ej2-angular-grids';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { ProgressBarModule } from '@syncfusion/ej2-angular-progressbar';
import { map } from 'rxjs';
import { trackWeights, weeklyQuotas } from '../../core/admin-settings';
import { personDashboard } from '../../core/person-dashboard';
import { ScorecardService } from '../../core/scorecard.service';

@Component({
  selector: 'app-person-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartModule, AccumulationChartModule, ButtonModule, MessageModule, GridModule, ProgressBarModule],
  providers: [
    CategoryService,
    LineSeriesService,
    ColumnSeriesService,
    LegendService,
    TooltipService,
    PieSeriesService,
    AccumulationLegendService,
    AccumulationTooltipService,
    AccumulationDataLabelService,
    PageService,
    SortService,
    ResizeService,
    AggregateService,
  ],
  templateUrl: './person-dashboard.html',
})
export class PersonDashboard {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scorecard = inject(ScorecardService);
  private readonly personId = toSignal(this.route.paramMap.pipe(map((params) => params.get('personId') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('personId') ?? '',
  });

  protected readonly pageSettings = { pageSize: 8 };
  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px', color: '#d7e7f5' };
  protected readonly categoryAxis = {
    valueType: 'Category',
    majorGridLines: { width: 0 },
    labelStyle: this.axisFont,
    labelRotation: -35,
  };
  protected readonly indexAxis = {
    minimum: 0,
    maximum: 100,
    title: 'ดัชนีของคนนี้',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };
  protected readonly mdAxis = {
    title: 'MD',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };
  protected readonly countAxis = {
    title: 'ครั้ง',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };
  protected readonly tooltip = { enable: true, shared: true };
  protected readonly legend = { visible: true, position: 'Top', textStyle: this.axisFont };
  protected readonly chartArea = { border: { width: 0 } };
  protected readonly marker = { visible: true, width: 8, height: 8 };
  protected readonly pieLegend = { visible: true, position: 'Bottom', textStyle: this.axisFont };
  protected readonly pieTooltip = { enable: true };
  protected readonly dataLabel = {
    visible: true,
    name: 'text',
    position: 'Outside',
    font: this.axisFont,
  };

  protected readonly view = computed(() => {
    const person = this.scorecard.roster().find((item) => item.id === this.personId());
    return personDashboard(person, this.scorecard.tickets(), {
      weights: trackWeights(),
      quota: person ? weeklyQuotas()[person.level] : undefined,
    });
  });

  protected readonly prevPerson = computed(() => {
    const list = this.scorecard.people();
    const currId = this.personId();
    const idx = list.findIndex((p) => p.id === currId);
    if (idx > 0) {
      return list[idx - 1];
    }
    return null;
  });

  protected readonly nextPerson = computed(() => {
    const list = this.scorecard.people();
    const currId = this.personId();
    const idx = list.findIndex((p) => p.id === currId);
    if (idx >= 0 && idx < list.length - 1) {
      return list[idx + 1];
    }
    return null;
  });

  protected goToPerson(id: string): void {
    void this.router.navigate(['/people', id]);
  }

  protected back(): void {
    void this.router.navigate(['/people']);
  }
}

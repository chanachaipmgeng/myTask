import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  CategoryService,
  ChartModule,
  LegendService,
  LineSeriesService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { map } from 'rxjs';
import { trackWeights, weeklyQuotas } from '../../core/admin-settings';
import { personDashboard } from '../../core/person-dashboard';
import { ScorecardService } from '../../core/scorecard.service';

@Component({
  selector: 'app-person-dashboard',
  imports: [ChartModule, ButtonModule, MessageModule],
  providers: [CategoryService, LineSeriesService, LegendService, TooltipService],
  templateUrl: './person-dashboard.html',
})
export class PersonDashboard {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scorecard = inject(ScorecardService);
  private readonly personId = toSignal(this.route.paramMap.pipe(map((params) => params.get('personId') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('personId') ?? '',
  });

  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px', color: '#d7e7f5' };
  protected readonly categoryAxis = {
    valueType: 'Category',
    majorGridLines: { width: 0 },
    labelStyle: this.axisFont,
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
  protected readonly tooltip = { enable: true, shared: true };
  protected readonly legend = { visible: true, position: 'Top', textStyle: this.axisFont };
  protected readonly chartArea = { border: { width: 0 } };
  protected readonly marker = { visible: true, width: 8, height: 8 };

  protected readonly view = computed(() => {
    const person = this.scorecard.roster().find((item) => item.id === this.personId());
    return personDashboard(person, this.scorecard.tickets(), {
      weights: trackWeights(),
      quota: person ? weeklyQuotas()[person.level] : undefined,
    });
  });

  protected back(): void {
    void this.router.navigate(['/people']);
  }
}

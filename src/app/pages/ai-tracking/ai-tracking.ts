import { Component, computed, inject } from '@angular/core';
import {
  CategoryService,
  ChartModule,
  ColumnSeriesService,
  LegendService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { acceptedTrackedMd, aiTicketPoints, formatTrackedMd, researchSpikeShare } from '../../core/ai-tracking';
import { ScorecardService } from '../../core/scorecard.service';

@Component({
  selector: 'app-ai-tracking',
  imports: [ChartModule],
  providers: [CategoryService, ColumnSeriesService, LegendService, TooltipService],
  templateUrl: './ai-tracking.html',
})
export class AiTrackingPage {
  private readonly scorecard = inject(ScorecardService);

  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px', color: '#d7e7f5' };
  protected readonly categoryAxis = {
    valueType: 'Category',
    majorGridLines: { width: 0 },
    labelRotation: -40,
    labelIntersectAction: 'Rotate',
    labelStyle: this.axisFont,
  };
  protected readonly mdAxis = {
    minimum: 0,
    title: 'MD',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };
  protected readonly tooltip = { enable: true };
  protected readonly legend = { visible: true, position: 'Top', textStyle: this.axisFont };
  protected readonly chartArea = { border: { width: 0 } };

  protected readonly points = computed(() => aiTicketPoints(this.scorecard.tickets()));
  protected readonly share = computed(() => researchSpikeShare(this.scorecard.people(), this.scorecard.tickets()));
  protected readonly acceptedMd = computed(() => formatTrackedMd(acceptedTrackedMd(this.scorecard.tickets())));
  protected readonly trackedMd = computed(() =>
    formatTrackedMd(this.points().reduce((sum, point) => sum + point.md, 0)),
  );
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  CategoryService,
  ChartModule,
  ColumnSeriesService,
  LegendService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { AggregateService, GridModule, PageService, ResizeService, SortService } from '@syncfusion/ej2-angular-grids';
import { ProgressBarModule } from '@syncfusion/ej2-angular-progressbar';
import { currentViewer } from '../../core/admin-settings';
import { acceptedTrackedMd, aiTicketPoints, formatTrackedMd, researchSpikeShare } from '../../core/ai-tracking';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { ThemeService } from '../../core/theme.service';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';

@Component({
  selector: 'app-ai-tracking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartModule, GridModule, PageHeadComponent, ProgressBarModule, SectionCardComponent],
  providers: [CategoryService, ColumnSeriesService, LegendService, TooltipService, PageService, SortService, ResizeService, AggregateService],
  templateUrl: './ai-tracking.html',
})
export class AiTrackingPage {
  private readonly route = inject(ActivatedRoute);
  private readonly scorecard = inject(ScorecardService);
  protected readonly theme = inject(ThemeService);

  protected readonly isMine = this.route.snapshot.data['scope'] === 'mine';
  protected readonly activePersonId = computed(
    () => currentSession()?.person.id ?? currentViewer().id,
  );
  protected readonly scopedTickets = computed(() => {
    const all = this.scorecard.tickets();
    if (!this.isMine) return all;
    const selfId = this.activePersonId();
    return all.filter((t) => t.assigneeId === selfId);
  });
  protected readonly scopedPeople = computed(() => {
    const all = this.scorecard.people();
    if (!this.isMine) return all;
    const selfId = this.activePersonId();
    return all.filter((p) => p.id === selfId);
  });

  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' };
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
  protected readonly tooltip = {
    enable: true,
    shared: true,
    header: '${point.x}',
    format: '${series.name}: <b>${point.y}</b>',
  };
  protected readonly legend = {
    visible: true,
    position: 'Top',
    alignment: 'Center',
    textStyle: this.axisFont,
  };
  protected readonly chartArea = { border: { width: 0 } };
  protected readonly columnCorner = { topLeft: 4, topRight: 4 };

  protected readonly points = computed(() => aiTicketPoints(this.scopedTickets()));
  protected readonly share = computed(() => researchSpikeShare(this.scopedPeople(), this.scopedTickets()));
  protected readonly sharePct = computed(() => Math.min(100, Math.round(this.share().ratio * 100)));
  protected readonly acceptedMd = computed(() => formatTrackedMd(acceptedTrackedMd(this.scopedTickets())));
  protected readonly trackedMd = computed(() =>
    formatTrackedMd(this.points().reduce((sum, point) => sum + point.md, 0)),
  );
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
  StackingColumnSeriesService,
  LegendService,
  LineSeriesService,
  PieSeriesService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { AggregateService, GridModule, PageService, ResizeService, SortService } from '@syncfusion/ej2-angular-grids';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { map } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { trackWeights, weeklyQuotas } from '../../core/admin-settings';
import { mdCompositionTrend } from '../../core/dashboard-charts';
import { personDashboard } from '../../core/person-dashboard';
import { ScorecardService } from '../../core/scorecard.service';
import { ThemeService } from '../../core/theme.service';
import { KpiStatCardComponent } from '../../shared/kpi-stat-card/kpi-stat-card';

interface OlsDataPoint {
  month: string;
  ols: number;
}

interface OlsSummaryInfo {
  slope: number;
  text: string;
  badgeClass: string;
}

@Component({
  selector: 'app-person-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartModule, AccumulationChartModule, ButtonModule, MessageModule, GridModule, KpiStatCardComponent, TextBoxModule],
  providers: [
    CategoryService,
    LineSeriesService,
    ColumnSeriesService,
    StackingColumnSeriesService,
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
  private readonly api = inject(ApiClient);
  protected readonly theme = inject(ThemeService);
  private readonly personId = toSignal(this.route.paramMap.pipe(map((params) => params.get('personId') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('personId') ?? '',
  });

  protected readonly pageSettings = { pageSize: 8 };
  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' };
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

  protected readonly mdComposition = computed(() =>
    mdCompositionTrend(this.scorecard.tickets(), this.personId()),
  );

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

  protected readonly olsTrendData = computed<OlsDataPoint[]>(() => {
    const trend = this.view().trend;
    const n = trend.length;
    if (n < 2) {
      return trend.map((p) => ({ month: p.month, ols: p.index }));
    }
    const values = trend.map((p) => p.index);
    const meanX = (n - 1) / 2;
    const meanY = values.reduce((sum, v) => sum + v, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const dx = i - meanX;
      num += dx * (values[i] - meanY);
      den += dx * dx;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = meanY - slope * meanX;
    return trend.map((p, i) => ({
      month: p.month,
      ols: Math.round((intercept + slope * i) * 10) / 10,
    }));
  });

  protected readonly olsSummary = computed<OlsSummaryInfo | null>(() => {
    const trend = this.view().trend;
    const n = trend.length;
    if (n < 2) {
      return null;
    }
    const values = trend.map((p) => p.index);
    const meanX = (n - 1) / 2;
    const meanY = values.reduce((sum, v) => sum + v, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const dx = i - meanX;
      num += dx * (values[i] - meanY);
      den += dx * dx;
    }
    const rawSlope = den === 0 ? 0 : num / den;
    const slope = Math.round(rawSlope * 10) / 10;
    const sign = slope > 0 ? '+' : '';
    let badgeClass = 'e-badge-info';
    let note = 'เสถียร';
    if (slope >= 1.0) {
      badgeClass = 'e-badge-success';
      note = 'พัฒนาขึ้นต่อเนื่อง';
    } else if (slope <= -1.0) {
      badgeClass = 'e-badge-danger';
      note = 'แนวโน้มลดลง เฝ้าระวัง';
    }
    return {
      slope,
      text: `${sign}${slope}/เดือน (${note})`,
      badgeClass,
    };
  });

  // AI Coach 1-on-1 Dialogue state
  protected readonly aiPrompt = signal('');
  protected readonly aiInputText = signal('');
  protected readonly aiResponse = signal<string | null>(null);
  protected readonly aiLoading = signal(false);
  protected readonly aiProvider = signal<string | null>(null);
  protected readonly aiError = signal<string | null>(null);

  protected async askAi(promptText?: string): Promise<void> {
    const p = (promptText ?? this.aiInputText()).trim();
    if (!p || this.aiLoading()) return;
    this.aiPrompt.set(p);
    this.aiLoading.set(true);
    this.aiError.set(null);
    try {
      const res = await this.api.getAiCoachSummary(this.personId(), p);
      if (res.ok) {
        this.aiResponse.set(res.summary);
        this.aiProvider.set(res.provider);
      } else {
        this.aiError.set('ไม่สามารถสร้างบทวิเคราะห์ได้');
      }
    } catch (err: any) {
      this.aiError.set(err?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อระบบ AI Coach');
    } finally {
      this.aiLoading.set(false);
    }
  }

  protected clearAi(): void {
    this.aiResponse.set(null);
    this.aiPrompt.set('');
    this.aiInputText.set('');
    this.aiError.set(null);
  }

  protected goToPerson(id: string): void {
    void this.router.navigate(['/people', id]);
  }

  protected back(): void {
    void this.router.navigate(['/people']);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  AccumulationChartModule,
  AccumulationDataLabelService,
  AccumulationLegendService,
  AccumulationTooltipService,
  CategoryService,
  ChartModule,
  ColumnSeriesService,
  StackingAreaSeriesService,
  StackingColumnSeriesService,
  LegendService,
  LineSeriesService,
  PieSeriesService,
  PolarSeriesService,
  RadarSeriesService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { AggregateService, GridModule, PageService, ResizeService, SortService } from '@syncfusion/ej2-angular-grids';
import {
  SpeechToTextModule,
  TextBoxModule,
  TranscriptChangedEventArgs,
} from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { map } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { currentViewer, trackWeights, weeklyQuotas } from '../../core/admin-settings';
import { mdCompositionTrend } from '../../core/dashboard-charts';
import { personDashboard } from '../../core/person-dashboard';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { ThemeService } from '../../core/theme.service';
import { KpiStatCardComponent } from '../../shared/kpi-stat-card/kpi-stat-card';
import { PageHeadComponent, SectionCardComponent } from '../../shared/ui';
import {
  defaultThaiSpeechButtonSettings,
  mergeSpeechTranscript,
  speechErrorMessageTh,
} from '../../shared/speech-to-text';

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
  imports: [
    ChartModule,
    AccumulationChartModule,
    ButtonModule,
    MessageModule,
    GridModule,
    KpiStatCardComponent,
    TextBoxModule,
    SpeechToTextModule,
    RouterLink,
    PageHeadComponent,
    SectionCardComponent,
  ],
  providers: [
    CategoryService,
    LineSeriesService,
    ColumnSeriesService,
    PolarSeriesService,
    RadarSeriesService,
    StackingAreaSeriesService,
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
  protected readonly isMine = this.route.snapshot.data['scope'] === 'mine';
  private readonly routePersonId = toSignal(this.route.paramMap.pipe(map((params) => params.get('personId') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('personId') ?? '',
  });
  protected readonly personId = computed(() => {
    if (this.isMine) {
      return currentSession()?.person.id ?? currentViewer().id;
    }
    return this.routePersonId();
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
  protected readonly radarXAxis = {
    valueType: 'Category',
    labelStyle: this.axisFont,
  };
  protected readonly radarYAxis = {
    minimum: 0,
    maximum: 100,
    interval: 20,
    labelStyle: this.axisFont,
    lineStyle: { width: 0 },
  };
  protected readonly tooltip = {
    enable: true,
    shared: true,
    enableMarker: true,
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
  protected readonly marker = {
    visible: true,
    width: 7,
    height: 7,
    shape: 'Circle',
    isFilled: true,
  };
  protected readonly targetMarker = {
    visible: true,
    width: 8,
    height: 8,
    shape: 'Diamond',
    isFilled: true,
    fill: '#f0b429',
    border: { width: 1, color: '#f0b429' },
  };
  protected readonly columnCorner = { topLeft: 4, topRight: 4 };
  protected readonly pieLegend = {
    visible: true,
    position: 'Right',
    alignment: 'Center',
    shape: 'Circle',
    textStyle: this.axisFont,
  };
  protected readonly pieTooltip = {
    enable: true,
    format: '${point.x}: <b>${point.y}</b>',
  };
  protected readonly donutLabel = { visible: false };
  protected readonly piePalette = ['#4c68e5', '#3ec6e0', '#f0b429', '#7465e8', '#e35d6a', '#8fd0c6'];
  protected readonly centerTextStyle = computed(() => ({
    fontFamily: 'Sarabun, Tahoma, sans-serif',
    fontWeight: '700',
    size: '15px',
    color: this.theme.isDark() ? '#e2e8f0' : '#1e293b',
  }));

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

  protected readonly slipCenter = computed(() => {
    const total = this.view().slipShare.reduce((sum, row) => sum + row.y, 0);
    return { text: `${total}<br>ใบ`, textStyle: this.centerTextStyle() };
  });

  protected readonly categoryCenter = computed(() => {
    const total = this.view().categoryShare.reduce((sum, row) => sum + row.y, 0);
    const rounded = Math.round(total * 10) / 10;
    return { text: `${rounded}<br>MD`, textStyle: this.centerTextStyle() };
  });

  // ==========================================
  // 6-Dimensional Competency Radar Data
  // ==========================================
  protected readonly competencyRadarData = computed(() => {
    const v = this.view();
    const rows = this.scorecard.personRows();
    const myRow = rows.find((r) => r.id === this.personId());

    // 1. On-Time Delivery
    const closed = v.closedWork;
    const onTimeCount = closed.filter((w) => !w.weekOffsetLabel.includes('+')).length;
    const myOnTime = closed.length > 0 ? Math.round((onTimeCount / closed.length) * 100) : 90;
    const teamOnTime = 88;

    // 2. Estimation Accuracy
    let myAccuracy = 85;
    if (v.effortBars.length > 0) {
      const accRatios = v.effortBars.map((e) => Math.min(1, (e.estimateMd || 1) / (e.actualMd || 1)));
      myAccuracy = Math.round((accRatios.reduce((s, r) => s + r, 0) / accRatios.length) * 100);
    }
    const teamAccuracy = 82;

    // 3. DoD First-Time Right Quality
    const qualityOk = closed.filter((w) => w.reviewRounds <= 1 && w.reopenCount === 0).length;
    const myQuality = closed.length > 0 ? Math.round((qualityOk / closed.length) * 100) : 92;
    const teamQuality = 85;

    // 4. Quota Fulfillment
    const myQuotaPct = Math.min(100, Math.round(myRow ? myRow.planRawPct : 95));
    const teamQuotaPct = 92;

    // 5. Peer Review & Team Handoff
    const myPeer = Math.min(100, Math.round(myRow ? (myRow.weighted || 90) : 88));
    const teamPeer = 85;

    // 6. Spike Research & AI Innovation
    const mySpike = Math.min(100, Math.round(myRow && myRow.sidePct > 0 ? Math.min(100, myRow.sidePct * 3) : 80));
    const teamSpike = 78;

    return [
      { dimension: 'ส่งมอบตรงเวลา (On-Time)', personScore: myOnTime, teamAvg: teamOnTime },
      { dimension: 'ความแม่นยำ (Accuracy)', personScore: myAccuracy, teamAvg: teamAccuracy },
      { dimension: 'คุณภาพ (DoD First-Time)', personScore: myQuality, teamAvg: teamQuality },
      { dimension: 'เป้าหมายโควตา (Quota)', personScore: myQuotaPct, teamAvg: teamQuotaPct },
      { dimension: 'การรีวิวโค้ด (Peer Review)', personScore: myPeer, teamAvg: teamPeer },
      { dimension: 'นวัตกรรม & AI (Spike)', personScore: mySpike, teamAvg: teamSpike },
    ];
  });

  protected readonly prevPerson = computed(() => {
    if (this.isMine) return null;
    const list = this.scorecard.people();
    const currId = this.personId();
    const idx = list.findIndex((p) => p.id === currId);
    if (idx > 0) {
      return list[idx - 1];
    }
    return null;
  });

  protected readonly nextPerson = computed(() => {
    if (this.isMine) return null;
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
  private aiSpeechBase = '';

  protected readonly speechButtonSettings = defaultThaiSpeechButtonSettings;
  protected readonly speechTooltipSettings = {
    content: 'พูดคำถามเป็นภาษาไทย (ต้องอนุญาตไมโครโฟน)',
    stopContent: 'หยุดฟัง',
  };

  protected onAiSpeechStart(): void {
    this.aiSpeechBase = this.aiInputText().trim();
    this.aiError.set(null);
  }

  protected onAiSpeechTranscript(args: TranscriptChangedEventArgs): void {
    this.aiInputText.set(mergeSpeechTranscript(this.aiSpeechBase, String(args.transcript ?? '')));
  }

  protected onAiSpeechError(args: { error?: string }): void {
    this.aiError.set(speechErrorMessageTh(args.error));
  }

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
    void this.router.navigate([this.isMine ? '/me' : '/people']);
  }
}

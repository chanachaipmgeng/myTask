import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { SpeechToTextModule, TranscriptChangedEventArgs } from '@syncfusion/ej2-angular-inputs';
import { map } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { currentViewer, trackWeights, weeklyQuotas } from '../../core/admin-settings';
import { mdCompositionTrend } from '../../core/dashboard-charts';
import { personDashboard } from '../../core/person-dashboard';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { ThemeService } from '../../core/theme.service';
import {
  PageHeadComponent,
  SectionCardComponent,
  SfChartComponent,
  SfChartOptions,
  SfChartSeriesConfig,
  SfDonutChartComponent,
  SfDonutChartOptions,
  SfGridAggregate,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  SfMessageComponent,
  SfTextBoxComponent,
} from '../../shared/ui';
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
    ButtonModule,
    PageHeadComponent,
    SpeechToTextModule,
    RouterLink,
    SectionCardComponent,
    SfChartComponent,
    SfDonutChartComponent,
    SfGridComponent,
    SfMessageComponent,
    SfTextBoxComponent,
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

  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' };
  protected readonly categoryAxis = {
    valueType: 'Category' as const,
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
    valueType: 'Category' as const,
    labelStyle: this.axisFont,
  };
  protected readonly radarYAxis = {
    minimum: 0,
    maximum: 100,
    interval: 20,
    labelStyle: this.axisFont,
    lineStyle: { width: 0 },
  };
  protected readonly piePalette = ['#4c68e5', '#3ec6e0', '#f0b429', '#7465e8', '#e35d6a', '#8fd0c6'];

  protected readonly commonChartOptions: SfChartOptions = {
    height: '300px',
    exportable: true,
    fullscreenable: true,
    enableAnimation: true,
    legend: { visible: true, position: 'Top', alignment: 'Center', textStyle: this.axisFont },
    tooltip: { enable: true, shared: true, enableMarker: true, header: '${point.x}', format: '${series.name}: <b>${point.y}</b>' },
  };
  protected readonly qualityChartOptions: SfChartOptions = { ...this.commonChartOptions, height: '280px' };

  protected readonly selfTrendSeries = computed<SfChartSeriesConfig[]>(() => {
    const trend = this.view().trend;
    return [
      { type: 'Line', dataSource: trend, xName: 'month', yName: 'index', name: 'ดัชนีของตัวเอง', width: 2.5, fill: '#4c68e5', marker: { visible: true, width: 7, height: 7, shape: 'Circle', isFilled: true } },
      { type: 'Line', dataSource: trend, xName: 'month', yName: 'target', name: 'เป้า 75', width: 2, fill: '#f0b429', dashArray: '6,4', marker: { visible: true, width: 8, height: 8, shape: 'Diamond', isFilled: true, fill: '#f0b429', border: { width: 1, color: '#f0b429' } } },
      { type: 'Line', dataSource: this.olsTrendData(), xName: 'month', yName: 'ols', name: 'แนวโน้ม OLS (Slope)', width: 2, dashArray: '5,5', fill: '#a855f7' },
    ];
  });

  protected readonly effortSeries = computed<SfChartSeriesConfig[]>(() => {
    const bars = this.view().effortBars;
    return [
      { type: 'Column', dataSource: bars, xName: 'label', yName: 'estimateMd', name: 'Estimate MD', fill: '#4c68e5', columnWidth: 0.45, cornerRadius: { topLeft: 4, topRight: 4 } },
      { type: 'Column', dataSource: bars, xName: 'label', yName: 'actualMd', name: 'Actual MD', fill: '#3ec6e0', columnWidth: 0.45, cornerRadius: { topLeft: 4, topRight: 4 } },
    ];
  });

  protected readonly qualitySeries = computed<SfChartSeriesConfig[]>(() => {
    const bars = this.view().qualityBars;
    return [
      { type: 'Column', dataSource: bars, xName: 'label', yName: 'reviewRounds', name: 'รอบรีวิว', fill: '#7465e8', columnWidth: 0.45, cornerRadius: { topLeft: 4, topRight: 4 } },
      { type: 'Column', dataSource: bars, xName: 'label', yName: 'reopenCount', name: 'Reopen', fill: '#e35d6a', columnWidth: 0.45, cornerRadius: { topLeft: 4, topRight: 4 } },
    ];
  });

  protected readonly mdCompSeries = computed<SfChartSeriesConfig[]>(() => {
    const pts = this.mdComposition();
    return [
      { type: 'StackingArea', dataSource: pts, xName: 'month', yName: 'plannedMd', name: 'Planned (ในแผน)', fill: '#4c68e5', opacity: 0.85 },
      { type: 'StackingArea', dataSource: pts, xName: 'month', yName: 'unplannedGeneralMd', name: 'Unplanned ทั่วไป', fill: '#3ec6e0', opacity: 0.85 },
      { type: 'StackingArea', dataSource: pts, xName: 'month', yName: 'mdMandateMd', name: '⚡ MD Mandate (สั่งตรง)', fill: '#f59e0b', opacity: 0.9 },
    ];
  });

  protected readonly radarSeries = computed<SfChartSeriesConfig[]>(() => {
    const data = this.competencyRadarData();
    return [
      { type: 'Radar', drawType: 'Line', dataSource: data, xName: 'dimension', yName: 'personScore', name: 'ผลงานตนเอง', width: 2.5, fill: '#4c68e5', marker: { visible: true, width: 6, height: 6, fill: '#4c68e5' } },
      { type: 'Radar', drawType: 'Line', dataSource: data, xName: 'dimension', yName: 'teamAvg', name: 'ค่าเฉลี่ยทีม', width: 2, dashArray: '4,4', fill: '#a855f7', marker: { visible: true, width: 5, height: 5, fill: '#a855f7' } },
    ];
  });

  protected readonly slipDonutOptions = computed<SfDonutChartOptions>(() => {
    const total = this.view().slipShare.reduce((sum, row) => sum + row.y, 0);
    return {
      height: '280px',
      innerRadius: '62%',
      radius: '80%',
      centerLabel: `${total}<br>ใบ`,
      palettes: this.piePalette,
      legend: { visible: true, position: 'Bottom', alignment: 'Center', textStyle: this.axisFont },
      tooltip: { enable: true, format: '${point.x}: <b>${point.y}</b>' },
      exportable: true,
    };
  });

  protected readonly categoryDonutOptions = computed<SfDonutChartOptions>(() => {
    const total = this.view().categoryShare.reduce((sum, row) => sum + row.y, 0);
    const rounded = Math.round(total * 10) / 10;
    return {
      height: '280px',
      innerRadius: '62%',
      radius: '80%',
      centerLabel: `${rounded}<br>MD`,
      palettes: this.piePalette,
      legend: { visible: true, position: 'Bottom', alignment: 'Center', textStyle: this.axisFont },
      tooltip: { enable: true, format: '${point.x}: <b>${point.y}</b>' },
      exportable: true,
    };
  });

  protected readonly openWorkColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'ใบ', width: 110 },
    { field: 'title', headerText: 'เรื่อง', width: 180 },
    { field: 'type', headerText: 'ประเภท', width: 100 },
    { field: 'size', headerText: 'ขนาด', width: 75 },
    { field: 'status', headerText: 'สถานะ', width: 110 },
    { field: 'estimateMd', headerText: 'Est', width: 75, textAlign: 'Right', format: 'N2' },
    { field: 'dueOnLabel', headerText: 'วันส่ง', width: 105 },
    { field: 'unplannedLabel', headerText: 'แผน', width: 85 },
  ];
  protected readonly openWorkAggregates: SfGridAggregate[] = [
    { field: 'id', type: 'Count', prefix: 'รวม ', suffix: ' ใบ' },
    { field: 'estimateMd', type: 'Sum', format: 'N2', prefix: 'รวม ', suffix: ' MD' },
  ];
  protected readonly closedWorkColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'ใบ', width: 110 },
    { field: 'title', headerText: 'เรื่อง', width: 170 },
    { field: 'type', headerText: 'ประเภท', width: 100 },
    { field: 'size', headerText: 'ขนาด', width: 75 },
    { field: 'estimateMd', headerText: 'Est', width: 75, textAlign: 'Right', format: 'N2' },
    { field: 'actualMd', headerText: 'Actual', width: 80, textAlign: 'Right', format: 'N2' },
    { field: 'weekOffsetLabel', headerText: 'สัปดาห์', width: 100 },
    { field: 'reviewRounds', headerText: 'รีวิว', width: 75, textAlign: 'Right' },
    { field: 'reopenCount', headerText: 'Reopen', width: 75, textAlign: 'Right' },
    { field: 'score', headerText: 'คะแนน', width: 75, textAlign: 'Right' },
  ];
  protected readonly closedWorkAggregates: SfGridAggregate[] = [
    { field: 'id', type: 'Count', prefix: 'รวม ', suffix: ' ใบ' },
    { field: 'actualMd', type: 'Sum', format: 'N2', prefix: 'รวม ', suffix: ' MD' },
    { field: 'score', type: 'Average', format: 'N1', prefix: 'เฉลี่ย ' },
  ];
  protected readonly workGridOptions: SfGridOptions = {
    paging: true,
    pageSize: 8,
    sorting: true,
    resizable: true,
    search: true,
    excelExport: true,
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
      { dimension: 'ส่งตรง (On-Time)', personScore: myOnTime, teamAvg: teamOnTime },
      { dimension: 'แม่นยำ (Accuracy)', personScore: myAccuracy, teamAvg: teamAccuracy },
      { dimension: 'DoD Gate (คุณภาพ)', personScore: myQuality, teamAvg: teamQuality },
      { dimension: 'โควตา (Quota)', personScore: myQuotaPct, teamAvg: teamQuotaPct },
      { dimension: 'รีวิวโค้ด (Peer)', personScore: myPeer, teamAvg: teamPeer },
      { dimension: 'AI & นวัตกรรม', personScore: mySpike, teamAvg: teamSpike },
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

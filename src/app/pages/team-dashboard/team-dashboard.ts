import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { canCaptureKpi, effectiveRole } from '../../core/admin-settings';
import { ApiClient, KpiSnapshotPeriodDto, KpiSnapshotRowDto } from '../../core/api-client';
import { mdCompositionTrend, monthlyTrend, personMonthIndexHeatmap, quotaBars } from '../../core/dashboard-charts';
import { kpiExplanations } from '../../core/kpi-meaning';
import { KpiPeriodType, previousMonthKey } from '../../core/kpi-snapshot';
import { ScorecardService } from '../../core/scorecard.service';
import { ThemeService } from '../../core/theme.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { INDEX_TARGET, formatMd, sampleWorkloadPoints } from '../../core/scoring';
import { ShellNotice } from '../../core/shell-notice';
import { todayInBangkok } from '../../core/workflow';
import { TEAM_CONTEXT_2568 } from '../../data/team-context';
import {
  FilterChipOption,
  FilterChipsComponent,
  FormFieldComponent,
  LoadingSkeletonComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  WorkspaceAsidebarComponent,
  prismChartPalette,
} from '../../shared/ui';
import { SfChartComponent, SfChartOptions, SfChartSeriesConfig } from '../../shared/sf/sf-chart/sf-chart';
import { SfDonutChartComponent, SfDonutChartOptions } from '../../shared/sf/sf-donut-chart/sf-donut-chart';
import { SfHeatmapCell, SfHeatmapComponent, SfHeatmapOptions } from '../../shared/sf/sf-heatmap/sf-heatmap';
import { SfDropdownComponent } from '../../shared/sf/sf-dropdown/sf-dropdown';
import {
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
} from '../../shared/sf/sf-grid/sf-grid';
import { SfMessageComponent } from '../../shared/sf/sf-message/sf-message';
import { SfTextBoxComponent } from '../../shared/sf/sf-textbox/sf-textbox';
import { listTeamWorkspaceCards, type WorkspaceTrackFilter } from '../../../../shared/domain/workspace-scope';
import { resolvePersonTeamId } from '../../../../shared/domain/work-views';
import { trackDisplayLabel, type Person } from '../../core/models';

type TrackFilter = WorkspaceTrackFilter;

const LIVE_MODE = 'live';

@Component({
  selector: 'app-team-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    FilterChipsComponent,
    PageHeadComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    FormFieldComponent,
    WorkspaceAsidebarComponent,
    SfChartComponent,
    SfDonutChartComponent,
    SfHeatmapComponent,
    SfDropdownComponent,
    SfGridComponent,
    SfMessageComponent,
    SfTextBoxComponent,
  ],
  templateUrl: './team-dashboard.html',
  styleUrl: './team-dashboard.scss',
})
export class TeamDashboard {
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient, { optional: true });
  private readonly notice = inject(ShellNotice);
  private readonly workspace = inject(WorkspaceFilter);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly canCapture = canCaptureKpi;
  protected readonly context = TEAM_CONTEXT_2568;
  protected readonly captureTypeOptions = [
    { text: 'เดือน', value: 'month' },
    { text: 'ไตรมาส', value: 'quarter' },
  ];
  protected readonly track = signal<TrackFilter>('All');
  private readonly syncWorkspaceTrack = effect(() => {
    const track = this.workspace.track();
    if (this.track() !== track) {
      this.track.set(track);
    }
  });
  /** คน/ใบสำหรับชาร์ต — member ใช้ทั้งทีมตัวเอง (ไม่ force person=self) */
  private readonly scopedPeople = computed(() => {
    if (effectiveRole() === 'member') {
      return this.memberTeamPeople();
    }
    return this.workspace.applyToPeople(this.scorecard.people());
  });
  private readonly scopedTickets = computed(() => {
    if (effectiveRole() === 'member') {
      const ids = new Set(this.memberTeamPeople().map((p) => p.id));
      return this.scorecard.tickets().filter((t) => ids.has(t.assigneeId));
    }
    return this.workspace.applyToTickets(this.scorecard.tickets(), this.scorecard.people());
  });

  private readonly memberTeamPeople = computed(() => {
    const myTeam = this.workspace.selfTeamId();
    if (!myTeam) return [];
    return this.scorecard
      .people()
      .filter((p) => p.active !== false && resolvePersonTeamId(p) === myTeam);
  });

  protected readonly managedTeamCards = computed(() => {
    const all = listTeamWorkspaceCards(this.scorecard.people(), this.scorecard.teams());
    const role = effectiveRole();
    if (role === 'member') {
      const myTeam = this.workspace.selfTeamId();
      return myTeam ? all.filter((card) => card.id === myTeam) : [];
    }
    const allowed = this.scorecard.effectiveAllowedTeams();
    if (allowed === null) {
      return all;
    }
    return all.filter((card) => allowed.includes(card.id));
  });

  protected readonly teamMembers = computed(() => {
    const people = this.scopedPeople();
    const rows = this.scorecard.personRows();
    const tickets = this.scopedTickets();
    const rowMap = new Map(rows.map((r) => [r.id, r]));
    const selfId = this.workspace.selfPersonId();
    const role = effectiveRole();

    return people.map((p) => {
      const row = rowMap.get(p.id);
      const activeTickets = tickets.filter((t) => t.assigneeId === p.id && !t.closed);
      const canOpen = role !== 'member' || p.id === selfId;
      return {
        id: p.id,
        nickname: p.nickname,
        fullName: p.fullName || p.nickname,
        track: p.track,
        role: p.jobTitle || p.role || 'Application Developer',
        index: row?.index ?? 0,
        quotaMd: row?.quota ?? 3.5,
        activeTicketsCount: activeTickets.length,
        avatarUrl: p.avatarUrl,
        canOpen,
      };
    });
  });

  protected teamMembersPreview(teamId: string): Person[] {
    return this.scorecard
      .people()
      .filter((p) => p.active !== false && resolvePersonTeamId(p) === teamId)
      .slice(0, 6);
  }

  protected readonly activeTeamTab = signal<'members' | 'charts' | 'heatmap'>('members');
  protected readonly memberPage = signal<number>(1);
  protected readonly memberPageSize = 12;
  protected readonly previewMemberId = signal<string>('');

  protected readonly teamTabOptions = computed<FilterChipOption[]>(() => [
    { id: 'members', label: 'ทีม & สมาชิก', count: this.teamMembers().length },
    { id: 'charts', label: 'กราฟแนวโน้ม & โควตา' },
    { id: 'heatmap', label: 'Heatmap & Snapshot' },
  ]);

  protected readonly memberTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.teamMembers().length / this.memberPageSize)),
  );
  protected readonly pagedTeamMembers = computed(() => {
    const page = Math.min(this.memberPage(), this.memberTotalPages());
    const start = (page - 1) * this.memberPageSize;
    return this.teamMembers().slice(start, start + this.memberPageSize);
  });
  protected readonly previewMember = computed(() => {
    const list = this.teamMembers();
    if (!list.length) return null;
    const id = this.previewMemberId();
    return list.find((m) => m.id === id) ?? list[0]!;
  });

  protected setTeamTab(id: string): void {
    if (id === 'members' || id === 'charts' || id === 'heatmap') {
      this.activeTeamTab.set(id);
    }
  }
  protected setMemberPage(page: number): void {
    if (page >= 1 && page <= this.memberTotalPages()) {
      this.memberPage.set(page);
    }
  }
  protected selectPreviewMember(personId: string): void {
    this.previewMemberId.set(personId);
  }

  protected readonly managedTeamChipOptions = computed<FilterChipOption[]>(() => [
    { id: 'all', label: 'ทุกทีม', count: this.managedTeamCards().length },
    ...this.managedTeamCards().map((c) => ({
      id: c.id,
      label: c.name,
      count: c.memberCount,
    })),
  ]);

  protected onManagedTeamChip(id: string): void {
    if (!id || id === 'all') {
      this.clearManagedTeam();
    } else {
      this.selectManagedTeam(id);
    }
  }

  protected selectManagedTeam(teamId: string): void {
    this.memberPage.set(1);
    this.workspace.setTeam(teamId);
  }

  protected clearManagedTeam(): void {
    this.memberPage.set(1);
    this.workspace.setTeam('');
  }

  protected openMember(personId: string): void {
    const role = effectiveRole();
    const selfId = this.workspace.selfPersonId();
    if (role === 'member') {
      if (personId === selfId) {
        void this.router.navigate(['/me']);
      }
      return;
    }
    this.workspace.setPerson(personId);
    void this.workspace.navigateWithFilter(['/workspace/people', personId]);
  }
  protected readonly periodMode = signal(LIVE_MODE);
  protected readonly periods = signal<KpiSnapshotPeriodDto[]>([]);
  protected readonly snapshotRows = signal<KpiSnapshotRowDto[]>([]);
  protected readonly captureType = signal<KpiPeriodType>('month');
  protected readonly captureKey = signal(previousMonthKey(todayInBangkok()));
  protected readonly isExistingSnapshot = computed(() => {
    const type = this.captureType();
    const key = this.captureKey().trim();
    return this.periods().some((p) => p.periodType === type && p.periodKey === key);
  });
  protected readonly capturing = signal(false);
  protected readonly snapshotMessage = signal('');
  protected readonly snapshotError = signal('');
  protected readonly loadingSnapshot = signal(false);

  protected readonly palette = computed(() => prismChartPalette(this.theme.isDark()));
  protected readonly target = INDEX_TARGET;
  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' };
  protected readonly categoryAxis = {
    valueType: 'Category' as const,
    majorGridLines: { width: 0 },
    labelStyle: this.axisFont,
  };
  protected readonly percentAxis = {
    minimum: 0,
    opposedPosition: true,
    title: 'เปอร์เซ็นต์',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorGridLines: { width: 1, dashArray: '4,4' },
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };
  protected readonly quotaAxis = {
    minimum: 0,
    opposedPosition: true,
    title: 'MD',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorGridLines: { width: 1, dashArray: '4,4' },
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };

  protected readonly snapshotColumns: SfGridColumn[] = [
    { field: 'nickname', headerText: 'พนักงาน', width: 175, cellType: 'person', personIdField: 'personId' },
    { field: 'trackLabel', headerText: 'สาย', width: 115, cellType: 'badge' },
    { field: 'index', headerText: 'ดัชนี', width: 140, format: 'N1', cellType: 'progress' },
    { field: 'closedCount', headerText: 'ใบปิด', width: 90, textAlign: 'Right', cellType: 'metric' },
    { field: 'closedMd', headerText: 'MD ปิด', width: 105, textAlign: 'Right', format: 'N2', cellType: 'metric' },
    { field: 'planIndex', headerText: 'แผน %', width: 100, textAlign: 'Right', format: 'N1', cellType: 'metric', suffix: '%' },
    { field: 'weighted', headerText: 'ถ่วงใบ', width: 100, textAlign: 'Right', format: 'N1', cellType: 'metric' },
  ];
  protected readonly snapshotGridOptions: SfGridOptions = listGridOptions({
    id: 'team-snapshot-grid',
    height: '320',
    excelExport: true,
    exportFileName: 'team-kpi-snapshot',
  });

  protected readonly workloadDonutOptions = computed<SfDonutChartOptions>(() => ({
    height: '260px',
    innerRadius: '64%',
    radius: '84%',
    centerLabel: TEAM_CONTEXT_2568.tasks.toLocaleString('en-US'),
    centerSubLabel: 'ใบงานทั้งปี',
    palettes: this.palette(),
    legend: { visible: true, position: 'Bottom', alignment: 'Center' },
    tooltip: { enable: true, format: '${point.x}: <b>${point.y}%</b>' },
    exportable: true,
    exportFileName: 'team-workload-donut',
  }));

  protected readonly sampleDonutOptions = computed<SfDonutChartOptions>(() => {
    const md = this.samplePoints().reduce((sum, point) => sum + point.y, 0);
    return {
      height: '260px',
      innerRadius: '64%',
      radius: '84%',
      centerLabel: formatMd(md),
      centerSubLabel: 'MD รวม',
      palettes: this.palette(),
      legend: { visible: true, position: 'Bottom', alignment: 'Center' },
      tooltip: { enable: true, format: '${point.x}: <b>${point.y}</b> MD' },
      exportable: true,
      exportFileName: 'team-sample-donut',
    };
  });

  protected readonly monthlySeries = computed<SfChartSeriesConfig[]>(() => {
    const pts = this.monthlyPoints();
    const seriesMarker = { visible: true, width: 7, height: 7, shape: 'Circle', isFilled: true };
    const targetMarker = { visible: true, width: 8, height: 8, shape: 'Diamond', isFilled: true, fill: '#f0b429', border: { width: 1, color: '#f0b429' } };
    return [
      { type: 'Line', dataSource: pts, xName: 'month', yName: 'plan', name: 'ปิดตามแผน', width: 2.5, fill: '#2746b3', marker: seriesMarker },
      { type: 'Line', dataSource: pts, xName: 'month', yName: 'accuracy', name: 'ความแม่น', width: 2.5, fill: '#0d9488', marker: seriesMarker },
      { type: 'Line', dataSource: pts, xName: 'month', yName: 'rework', name: 'Rework', width: 2.5, fill: '#e11d48', marker: seriesMarker },
      { type: 'Line', dataSource: pts, xName: 'month', yName: 'target', name: 'เป้า 75', width: 2, fill: '#f59e0b', dashArray: '6,4', marker: targetMarker },
    ];
  });
  protected readonly monthlyChartOptions: SfChartOptions = {
    height: '260px',
    exportable: true,
    fullscreenable: true,
    zoomable: true,
    crosshair: true,
    exportFileName: 'team-monthly-trend',
    enableAnimation: true,
    legend: { visible: true, position: 'Top', alignment: 'Center', textStyle: this.axisFont },
    tooltip: { enable: true, shared: true, enableMarker: true, header: '${point.x}', format: '${series.name}: <b>${point.y}</b>' },
  };

  protected readonly quotaSeries = computed<SfChartSeriesConfig[]>(() => {
    const pts = this.quotaPoints();
    const freeFill = this.theme.isDark() ? '#1e3a5f' : '#99f6e4';
    return [
      { type: 'StackingColumn', dataSource: pts, xName: 'nickname', yName: 'used', name: 'ใช้แล้ว', fill: '#0d9488', columnWidth: 0.48 },
      { type: 'StackingColumn', dataSource: pts, xName: 'nickname', yName: 'free', name: 'ว่าง', fill: freeFill, columnWidth: 0.48, cornerRadius: { topLeft: 8, topRight: 8 } },
    ];
  });
  protected readonly quotaChartOptions: SfChartOptions = {
    height: '260px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'team-quota-bars',
    enableAnimation: true,
    legend: { visible: true, position: 'Top', alignment: 'Center', textStyle: this.axisFont },
    tooltip: { enable: true, shared: true, enableMarker: true, header: '${point.x}', format: '${series.name}: <b>${point.y}</b>' },
  };

  protected readonly mdCompSeries = computed<SfChartSeriesConfig[]>(() => {
    const pts = this.mdCompositionPoints();
    return [
      { type: 'StackingArea', dataSource: pts, xName: 'month', yName: 'plannedMd', name: 'Planned (ในแผน)', fill: '#2746b3', opacity: 0.84 },
      { type: 'StackingArea', dataSource: pts, xName: 'month', yName: 'unplannedGeneralMd', name: 'Unplanned ทั่วไป', fill: '#0d9488', opacity: 0.84 },
      { type: 'StackingArea', dataSource: pts, xName: 'month', yName: 'mdMandateMd', name: '⚡ MD Mandate (สั่งตรง)', fill: '#f59e0b', opacity: 0.9 },
    ];
  });
  protected readonly mdCompChartOptions: SfChartOptions = {
    height: '270px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'team-md-composition',
    enableAnimation: true,
    legend: { visible: true, position: 'Top', alignment: 'Center', textStyle: this.axisFont },
    tooltip: { enable: true, shared: true, enableMarker: true, header: '${point.x}', format: '${series.name}: <b>${point.y}</b>' },
  };

  protected readonly alerts = this.scorecard.alerts;
  protected readonly explanations = computed(() => kpiExplanations(this.scopedTickets(), this.scopedPeople()));
  protected readonly filterHint = computed(() =>
    this.workspace.hasActiveFilter() ? `กำลังกรอง: ${this.workspace.filterSummary()}` : '',
  );

  protected readonly viewingLive = computed(() => this.periodMode() === LIVE_MODE);

  protected readonly periodOptions = computed(() => [
    { text: 'ปัจจุบัน (คำนวณสด)', value: LIVE_MODE },
    ...this.periods().map((period) => ({
      text: `${period.periodType === 'month' ? 'เดือน' : 'ไตรมาส'} ${period.periodKey} · ${period.rowCount} คน`,
      value: `${period.periodType}|${period.periodKey}`,
    })),
  ]);

  protected readonly monthlyPoints = computed(() =>
    monthlyTrend(this.scopedPeople(), this.scopedTickets(), this.track()),
  );
  protected readonly quotaPoints = computed(() =>
    quotaBars(this.scopedPeople(), this.scopedTickets(), this.track()),
  );
  protected readonly mdCompositionPoints = computed(() =>
    mdCompositionTrend(this.scopedTickets()),
  );
  protected readonly indexHeatmap = computed(() =>
    personMonthIndexHeatmap(this.scopedPeople(), this.scopedTickets()),
  );
  protected readonly heatCells = computed<SfHeatmapCell[]>(() =>
    this.indexHeatmap().cells.map((cell) => ({
      x: cell.month,
      y: cell.nickname,
      value: cell.index,
    })),
  );
  protected readonly heatOptions = computed<SfHeatmapOptions>(() => ({
    height: `${Math.min(560, Math.max(300, this.indexHeatmap().people.length * 36 + 108))}px`,
    xTitle: 'เดือนที่ปิดงาน',
  }));

  protected readonly samplePoints = computed(() =>
    sampleWorkloadPoints(this.scopedTickets(), this.track()),
  );

  protected readonly sampleSummary = computed(() => {
    const track = this.track();
    const tickets = this.scopedTickets().filter((ticket) => track === 'All' || ticket.track === track);
    const md = tickets.reduce(
      (sum, ticket) => sum + (ticket.closed ? ticket.actualMd : ticket.estimateMd),
      0,
    );
    return `${tickets.length} ใบ · ${formatMd(md)} MD`;
  });

  protected readonly snapshotTableRows = computed(() => {
    const track = this.track();
    return this.snapshotRows()
      .filter((row) => track === 'All' || row.track === track)
      .map((row) => ({
        personId: row.personId,
        nickname: row.nickname,
        trackLabel: trackDisplayLabel(row.track),
        index: round1(row.score.developmentIndex),
        closedCount: row.score.closedCount,
        closedMd: row.score.closedMd,
        planIndex: round1(row.score.planIndexPct),
        weighted: round1(row.score.weightedScore),
      }));
  });

  protected readonly tasksLabel = TEAM_CONTEXT_2568.tasks.toLocaleString('en-US');

  constructor() {
    void this.scorecard.whenReady().then(() => this.reloadPeriods());
  }

  protected setTrackChip(value: string): void {
    this.workspace.setTrack(value);
    this.track.set(this.workspace.track());
  }

  protected drillToWork(track?: TrackFilter): void {
    if (track && track !== 'All') {
      this.workspace.setTrack(track);
    }
    void this.workspace.navigateWithFilter(['/work']);
  }

  protected drillToTickets(track?: TrackFilter): void {
    if (track && track !== 'All') {
      this.workspace.setTrack(track);
    }
    void this.workspace.navigateWithFilter(['/tickets']);
  }

  protected drillToPeople(): void {
    void this.workspace.navigateWithFilter(['/workspace/people']);
  }

  /** คลิก Heatmap → เปิด Person Workspace ตามชื่อเล่นบนแกน Y */
  protected onHeatmapCellClick(args: { yLabel?: string; yValue?: string | number | Date }): void {
    const nickname = String(args.yLabel ?? args.yValue ?? '').trim();
    if (!nickname) return;
    const person = this.scopedPeople().find((p) => p.nickname === nickname);
    if (person) this.openMember(person.id);
  }

  protected onSamplePointClick(args: { point?: { x?: unknown } }): void {
    const label = String(args.point?.x ?? '').toLowerCase();
    if (label.includes('r&d') || label.includes('rd')) {
      this.drillToTickets('RD');
      return;
    }
    if (label.includes('implement') || label.includes('imp')) {
      this.drillToTickets('Implement');
      return;
    }
    this.drillToTickets();
  }

  protected setPeriodMode(raw: unknown): void {
    const value = String(raw ?? LIVE_MODE);
    this.periodMode.set(value);
    if (value === LIVE_MODE) {
      this.snapshotRows.set([]);
      this.snapshotError.set('');
      return;
    }
    const [periodType, periodKey] = value.split('|') as [KpiPeriodType, string];
    void this.loadSnapshot(periodType, periodKey);
  }

  protected setCaptureType(raw: unknown): void {
    if (raw === 'month' || raw === 'quarter') {
      this.captureType.set(raw);
    }
  }

  protected onCaptureKey(raw: string): void {
    this.captureKey.set((raw ?? '').trim());
  }

  protected async captureSnapshot(): Promise<void> {
    if (!this.canCapture()) {
      this.snapshotError.set('เฉพาะ admin หรือ lead ที่จับ snapshot ได้');
      return;
    }
    if (!this.api) {
      this.snapshotError.set('โหมด mock ไม่บันทึก snapshot ลงเซิร์ฟเวอร์');
      return;
    }
    const periodType = this.captureType();
    const periodKey = this.captureKey().trim();
    if (!periodKey) {
      this.snapshotError.set('ใส่รหัสช่วง เช่น 2025-10 หรือ 2025-Q3');
      return;
    }
    this.capturing.set(true);
    this.snapshotError.set('');
    try {
      const result = await this.api.captureKpiSnapshot(periodType, periodKey);
      if (!result.ok) {
        const text = result.message ?? 'จับ snapshot ไม่สำเร็จ';
        this.snapshotError.set(text);
        this.notice.error(text);
        return;
      }
      const text = `จับ snapshot ${periodType} ${periodKey} แล้ว ${result.count ?? 0} คน`;
      this.snapshotMessage.set(text);
      this.notice.success(text);
      await this.reloadPeriods();
      this.periodMode.set(`${periodType}|${periodKey}`);
      await this.loadSnapshot(periodType, periodKey);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'จับ snapshot ไม่สำเร็จ';
      this.snapshotError.set(text);
      this.notice.error(text);
    } finally {
      this.capturing.set(false);
    }
  }

  private async reloadPeriods(): Promise<void> {
    if (!this.api || this.scorecard.mockMode() || !this.scorecard.usingApi()) {
      this.periods.set([]);
      return;
    }
    try {
      const result = await this.api.listKpiSnapshotPeriods();
      this.periods.set(result.periods);
    } catch {
      this.periods.set([]);
    }
  }

  private async loadSnapshot(periodType: KpiPeriodType, periodKey: string): Promise<void> {
    if (!this.api) {
      this.snapshotRows.set([]);
      return;
    }
    this.loadingSnapshot.set(true);
    this.snapshotError.set('');
    try {
      const result = await this.api.listKpiSnapshots(periodType, periodKey);
      if (!result.ok) {
        this.snapshotRows.set([]);
        this.snapshotError.set(result.message ?? 'โหลด snapshot ไม่สำเร็จ');
        return;
      }
      this.snapshotRows.set(result.rows);
    } catch (error) {
      this.snapshotRows.set([]);
      this.snapshotError.set(error instanceof Error ? error.message : 'โหลด snapshot ไม่สำเร็จ');
    } finally {
      this.loadingSnapshot.set(false);
    }
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

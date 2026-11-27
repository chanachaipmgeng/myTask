import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { currentViewer, effectiveRole, trackWeights, weeklyQuotas } from '../../core/admin-settings';
import { buildAnalyticsReport } from '../../core/analytics';
import { personDashboard } from '../../core/person-dashboard';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { ThemeService } from '../../core/theme.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { BentoSpotlightDirective } from '../../shared/motion/bento-spotlight.directive';
import { CountUpDirective } from '../../shared/ui/count-up';
import {
  FilterChipOption,
  FilterChipsComponent,
  SectionCardComponent,
  StatusBadgeComponent,
} from '../../shared/ui';
import { SfChartComponent, SfChartOptions, SfChartSeriesConfig } from '../../shared/sf/sf-chart/sf-chart';
import { SfDonutChartComponent, SfDonutChartOptions } from '../../shared/sf/sf-donut-chart/sf-donut-chart';
import {
  SfGridAggregate,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
} from '../../shared/sf/sf-grid/sf-grid';
import { SfMessageComponent } from '../../shared/sf/sf-message/sf-message';

interface ActivityEventItem {
  id: string;
  ticketId: string;
  timeLabel: string;
  title: string;
  sublabel: string;
  tone: 'emerald' | 'violet' | 'info' | 'danger' | 'primary';
  iconCss: string;
}

interface SmartCoachReply {
  query: string;
  headline: string;
  detail: string;
  ticketId?: string;
  route?: string;
  routeLabel?: string;
}

@Component({
  selector: 'app-my-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    RouterLink,
    SectionCardComponent,
    StatusBadgeComponent,
    FilterChipsComponent,
    BentoSpotlightDirective,
    CountUpDirective,
    SfChartComponent,
    SfDonutChartComponent,
    SfGridComponent,
    SfMessageComponent,
  ],
  templateUrl: './my-workspace.html',
  styleUrl: './my-workspace.scss',
})
export class MyWorkspacePage {
  private readonly scorecard = inject(ScorecardService);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly activeTab = signal<'bento' | 'open' | 'closed' | 'trend'>('bento');
  protected readonly coachQuery = signal('');
  protected readonly coachReply = signal<SmartCoachReply | null>(null);
  protected readonly revealedAgendaId = signal<string | null>(null);

  protected readonly quickPrompts = [
    'งานไหนเสี่ยงสุด',
    'สรุปคะแนนฉัน',
    'โควตาคงเหลือ',
    'เปิดบอร์ด',
  ] as const;

  protected readonly tabOptions = computed<FilterChipOption[]>(() => [
    { id: 'bento', label: 'ภาพรวม Bento' },
    { id: 'open', label: 'ตารางงานเปิด', count: this.view().openWork.length },
    { id: 'closed', label: 'ประวัติงานปิด', count: this.view().closedWork.length },
    { id: 'trend', label: 'แนวโน้มดัชนี' },
  ]);

  protected setActiveTab(id: string): void {
    if (id === 'bento' || id === 'open' || id === 'closed' || id === 'trend') {
      this.activeTab.set(id);
    }
  }

  protected readonly role = effectiveRole;
  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' };
  protected readonly categoryAxis = {
    valueType: 'Category' as const,
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
  protected readonly trendSeries = computed<SfChartSeriesConfig[]>(() => [
    {
      type: 'Line',
      dataSource: this.view().trend,
      xName: 'month',
      yName: 'index',
      name: 'ดัชนีของฉัน',
      width: 2.5,
      fill: '#6382f6',
      marker: { visible: true, width: 7, height: 7, shape: 'Circle', isFilled: true },
    },
    {
      type: 'Line',
      dataSource: this.view().trend,
      xName: 'month',
      yName: 'target',
      name: 'เป้ามาตรฐาน 75',
      width: 2,
      fill: '#f59e0b',
      dashArray: '6,4',
      marker: {
        visible: true,
        width: 8,
        height: 8,
        shape: 'Diamond',
        isFilled: true,
        fill: '#f59e0b',
        border: { width: 1, color: '#f59e0b' },
      },
    },
  ]);
  protected readonly trendChartOptions: SfChartOptions = {
    height: '280px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'my-self-trend',
    enableAnimation: true,
    legend: { visible: true, position: 'Top', alignment: 'Center', textStyle: this.axisFont },
    tooltip: {
      enable: true,
      shared: true,
      enableMarker: true,
      header: '${point.x}',
      format: '${series.name}: <b>${point.y}</b>',
    },
  };

  protected readonly openWorkColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'รหัสใบงาน', width: 115, cellType: 'ticket-link' },
    { field: 'title', headerText: 'ชื่องาน / โมดูล', width: 200 },
    { field: 'type', headerText: 'ประเภท', width: 115, cellType: 'badge' },
    { field: 'size', headerText: 'ขนาด', width: 75, cellType: 'badge', textAlign: 'Center' },
    { field: 'status', headerText: 'สถานะ', width: 125, cellType: 'badge' },
    { field: 'priorityLabel', headerText: 'Priority', width: 100, cellType: 'badge' },
    { field: 'estimateMd', headerText: 'Est MD', width: 90, textAlign: 'Right', format: 'N2', cellType: 'metric', suffix: ' MD' },
    { field: 'dueOnLabel', headerText: 'กำหนดส่ง', width: 115 },
    { field: 'unplannedLabel', headerText: 'แผน', width: 95, cellType: 'badge' },
    { field: 'actions', headerText: 'จัดการ', width: 180, allowSorting: false },
  ];
  protected readonly openWorkGridOptions: SfGridOptions = listGridOptions({
    id: 'my-open-work-grid-v2',
    height: '320',
  });
  protected readonly closedWorkColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'ใบงาน', width: 110, cellType: 'ticket-link' },
    { field: 'title', headerText: 'เรื่อง', width: 'auto', minWidth: 150 },
    { field: 'type', headerText: 'ประเภท', width: 105, cellType: 'badge' },
    { field: 'size', headerText: 'ขนาด', width: 68, cellType: 'badge', textAlign: 'Center' },
    { field: 'estimateMd', headerText: 'Est', width: 76, textAlign: 'Right', format: 'N2', cellType: 'metric' },
    { field: 'actualMd', headerText: 'Actual', width: 78, textAlign: 'Right', format: 'N2', cellType: 'metric' },
    { field: 'weekOffsetLabel', headerText: 'สัปดาห์', width: 105, cellType: 'badge' },
    { field: 'reviewRounds', headerText: 'รีวิว', width: 72, textAlign: 'Right', cellType: 'metric', format: 'N0' },
    { field: 'reopenCount', headerText: 'Reopen', width: 78, textAlign: 'Right', cellType: 'metric', format: 'N0' },
    { field: 'score', headerText: 'คะแนน', width: 88, textAlign: 'Right', cellType: 'score', format: 'N0' },
  ];
  protected readonly closedWorkAggregates: SfGridAggregate[] = [
    { field: 'id', type: 'Count', prefix: 'รวม ', suffix: ' ใบ' },
    { field: 'actualMd', type: 'Sum', format: 'N2', prefix: 'รวม ', suffix: ' MD' },
    { field: 'score', type: 'Average', format: 'N1', prefix: 'เฉลี่ย ' },
  ];
  protected readonly closedWorkGridOptions: SfGridOptions = listGridOptions({
    id: 'my-closed-work-grid',
    height: '320',
    excelExport: true,
    exportFileName: 'my-closed-work',
  });

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

  protected readonly greetingLine = computed(() => {
    const hour = new Date().getHours();
    const salutation = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
    return `${salutation} ${this.view().name}`;
  });

  /** Agenda งานเปิดเรียงตามกำหนดส่ง + checklist ส่งมอบถัดไป */
  protected readonly dueAgenda = computed(() => {
    const personId = this.activePerson()?.id ?? '';
    const riskIds = new Set(this.myRisks().map((r) => r.ticketId));
    return this.scorecard
      .tickets()
      .filter((ticket) => !ticket.closed && ticket.assigneeId === personId)
      .map((ticket) => {
        const dueKey = ticket.dueOn ?? ticket.firstDueOn ?? '';
        const status = ticket.workflowStatus ?? 'In Progress';
        const isHighRisk = riskIds.has(ticket.id) || ticket.weekOffset > 0 || String(status) === 'Blocked' || status === 'Reopened';
        const isMedium = status === 'Code Review' || status === 'Ready for QA' || status === 'In QA';
        return {
          id: ticket.id,
          title: ticket.title?.trim() || ticket.module,
          status,
          estimateMd: ticket.estimateMd,
          dueKey,
          dueLabel: dueKey || 'ยังไม่ระบุกำหนดส่ง',
          slipped: ticket.weekOffset > 0,
          weekOffset: ticket.weekOffset,
          priorityLevel: isHighRisk ? 'high' : isMedium ? 'medium' : 'normal',
          priorityText: isHighRisk ? 'ด่วน / เสี่ยง' : isMedium ? 'รอตรวจ / QA' : 'กำลังทำ',
          nextAction: nextDeliveryAction(status),
          checklist: deliveryChecklist(status, !!ticket.mrLink?.trim()),
        };
      })
      .sort((a, b) => {
        if (a.priorityLevel === 'high' && b.priorityLevel !== 'high') return -1;
        if (b.priorityLevel === 'high' && a.priorityLevel !== 'high') return 1;
        if (!a.dueKey && !b.dueKey) return a.id.localeCompare(b.id);
        if (!a.dueKey) return 1;
        if (!b.dueKey) return -1;
        return a.dueKey.localeCompare(b.dueKey) || a.id.localeCompare(b.id);
      });
  });

  protected readonly topTodoItems = computed(() => this.dueAgenda().slice(0, 5));

  protected readonly totalTaskCount = computed(() => this.view().openCount + this.view().closedCount);

  protected readonly overdueOrRiskCount = computed(() => {
    const riskSet = new Set(this.myRisks().map((r) => r.ticketId));
    for (const item of this.dueAgenda()) {
      if (item.slipped) riskSet.add(item.id);
    }
    return riskSet.size;
  });

  protected readonly freeMdLabel = computed(() => {
    const person = this.activePerson();
    if (!person) return '0.0';
    const quota = weeklyQuotas()[person.level];
    const openMd = this.view().openWork.reduce((sum, item) => sum + item.estimateMd, 0);
    const free = Math.max(0, quota - openMd - 1);
    return free.toFixed(1);
  });

  protected readonly closedProgressPct = computed(() => {
    const closed = this.view().closedCount;
    const total = this.totalTaskCount();
    return total > 0 ? Math.min(100, Math.round((closed / total) * 100)) : 100;
  });

  /** Breakdown สำหรับ Donut Chart แบบ Agent Desk (4 หมวดชัดเจน) */
  protected readonly overviewSegments = computed(() => {
    const closed = this.view().closedCount;
    const agenda = this.dueAgenda();
    let inProgress = 0;
    let reviewQa = 0;
    let riskOverdue = 0;

    for (const item of agenda) {
      if (item.priorityLevel === 'high') {
        riskOverdue++;
      } else if (item.priorityLevel === 'medium') {
        reviewQa++;
      } else {
        inProgress++;
      }
    }

    const total = Math.max(1, closed + inProgress + reviewQa + riskOverdue);
    const rows = [
      { label: 'ปิดสมบูรณ์', count: closed, pct: Math.round((closed / total) * 100), color: '#22c55e' },
      { label: 'กำลังพัฒนา', count: inProgress, pct: Math.round((inProgress / total) * 100), color: '#a855f7' },
      { label: 'รอตรวจ / QA', count: reviewQa, pct: Math.round((reviewQa / total) * 100), color: '#3b82f6' },
      { label: 'เสี่ยง / เลยกำหนด', count: riskOverdue, pct: Math.round((riskOverdue / total) * 100), color: '#f43f5e' },
    ];
    return rows;
  });

  protected readonly donutData = computed(() => {
    const nonZero = this.overviewSegments().filter((s) => s.count > 0);
    if (nonZero.length === 0) {
      return [{ label: 'ยังไม่มีข้อมูล', count: 1, color: '#3154cc' }];
    }
    return nonZero;
  });

  protected readonly donutOptions = computed<SfDonutChartOptions>(() => ({
    height: '188px',
    innerRadius: '69%',
    radius: '92%',
    centerLabel: this.view().indexLabel,
    centerSubLabel: 'ดัชนีคะแนน',
    palettes: this.donutData().map((d) => d.color),
    legend: { visible: false },
    enableSmartLabels: false,
    tooltip: { enable: true, format: '${point.x}: <b>${point.y} ใบ</b>' },
    motion: 'none',
  }));

  /** Activity Timeline (5 เหตุการณ์ล่าสุดจากใบงานจริงของฉัน) */
  protected readonly activityFeed = computed<ActivityEventItem[]>(() => {
    const items: ActivityEventItem[] = [];

    for (const risk of this.myRisks().slice(0, 2)) {
      items.push({
        id: `risk-${risk.ticketId}`,
        ticketId: risk.ticketId,
        timeLabel: `เสี่ยง ${risk.riskScore}`,
        title: `${risk.ticketId} · ${risk.title}`,
        sublabel: risk.reasons[0] || `สถานะ ${risk.status} · เฝ้าระวังส่งมอบ`,
        tone: 'danger',
        iconCss: 'e-icons e-warning',
      });
    }

    for (const agenda of this.dueAgenda().slice(0, 2)) {
      if (items.some((x) => x.ticketId === agenda.id)) continue;
      items.push({
        id: `open-${agenda.id}`,
        ticketId: agenda.id,
        timeLabel: agenda.dueKey ? agenda.dueKey.slice(5) : 'เปิดอยู่',
        title: `${agenda.id} · ${agenda.title}`,
        sublabel: `${agenda.status} · ถัดไป: ${agenda.nextAction}`,
        tone: agenda.priorityLevel === 'medium' ? 'info' : 'violet',
        iconCss: agenda.priorityLevel === 'medium' ? 'e-icons e-check-box' : 'e-icons e-clock',
      });
    }

    for (const closed of this.view().closedWork.slice(0, 3)) {
      if (items.length >= 5) break;
      items.push({
        id: `closed-${closed.id}`,
        ticketId: closed.id,
        timeLabel: closed.score != null ? `ได้ ${Math.round(closed.score)} คะแนน` : 'ปิดงานแล้ว',
        title: `ปิดงาน ${closed.id} · ${closed.title}`,
        sublabel: `ใช้ ${closed.actualMd} / Est ${closed.estimateMd} MD · รีวิว ${closed.reviewRounds} รอบ`,
        tone: 'emerald',
        iconCss: 'e-icons e-check',
      });
    }

    return items.slice(0, 5);
  });

  protected readonly trendSparkline = computed(() => {
    const raw = this.view().trend.map((t) => t.index);
    const points = raw.length > 0 ? [...raw, this.view().index] : [this.view().index];
    const width = 200;
    const height = 40;
    const paddingX = 8;
    const paddingY = 6;
    const minVal = 0;
    const maxVal = 100;

    const stepX = (width - paddingX * 2) / Math.max(1, points.length - 1);
    const coords = points.map((val, idx) => {
      const clamped = Math.max(minVal, Math.min(maxVal, val));
      const x = paddingX + idx * stepX;
      const y = height - paddingY - ((clamped - minVal) / (maxVal - minVal)) * (height - paddingY * 2);
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, val };
    });

    const linePath = coords.map((c, i) => (i === 0 ? `M ${c.x} ${c.y}` : `L ${c.x} ${c.y}`)).join(' ');
    const lastX = coords[coords.length - 1].x;
    const firstX = coords[0].x;
    const areaPath = `${linePath} L ${lastX} ${height} L ${firstX} ${height} Z`;
    const targetY = height - paddingY - ((75 - minVal) / (maxVal - minVal)) * (height - paddingY * 2);

    return {
      coords,
      linePath,
      areaPath,
      targetY: Math.round(targetY * 10) / 10,
      latest: coords[coords.length - 1],
      count: points.length,
    };
  });

  protected openTicket(id: string, event?: Event): void {
    event?.stopPropagation();
    if (id) this.ticketDetail.open(id);
  }

  protected toggleAgendaChecklist(id: string, event: Event): void {
    event.stopPropagation();
    this.revealedAgendaId.update((cur) => (cur === id ? null : id));
  }

  protected checklistProgress(item: { checklist: DeliveryCheckItem[] }): string {
    const done = item.checklist.filter((check) => check.done).length;
    return `${done}/${item.checklist.length}`;
  }

  protected onCoachInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.coachQuery.set(target?.value ?? '');
  }

  protected runQuickPrompt(prompt: string): void {
    this.coachQuery.set(prompt);
    this.submitCoachPrompt();
  }

  protected clearCoachReply(): void {
    this.coachReply.set(null);
  }

  protected submitCoachPrompt(event?: Event): void {
    event?.preventDefault();
    const raw = this.coachQuery().trim();
    if (!raw) return;
    const q = raw.toLowerCase();

    if (q.includes('บอร์ด') || q.includes('kanban') || q.includes('board')) {
      void this.router.navigate(['/work/board']);
      return;
    }
    if (q.includes('ไทม์ไลน์') || q.includes('gantt')) {
      void this.router.navigate(['/work/timeline']);
      return;
    }
    if (q.includes('ols') || q.includes('วิเคราะห์')) {
      void this.router.navigate(['/quality/ols']);
      return;
    }

    if (q.includes('เสี่ยง') || q.includes('เลยกำหนด') || q.includes('overdue') || q.includes('ด่วน')) {
      const topRisk = this.myRisks()[0];
      if (topRisk) {
        this.coachReply.set({
          query: raw,
          headline: `พบงานเสี่ยงสูงสุด: ${topRisk.ticketId} (${topRisk.riskLevel} · ${topRisk.riskScore})`,
          detail: `${topRisk.title} — ${topRisk.reasons.join(' · ')}`,
          ticketId: topRisk.ticketId,
        });
      } else {
        this.coachReply.set({
          query: raw,
          headline: 'ยอดเยี่ยม! ตอนนี้ไม่มีใบงานเสี่ยงหรือเลยกำหนด',
          detail: `คุณถือ WIP ${this.view().openCount} ใบ และทุกใบยังอยู่ในกรอบเวลาปกติ`,
          route: '/work/board',
          routeLabel: 'เปิดบอร์ดงาน',
        });
      }
      this.coachQuery.set('');
      return;
    }

    if (q.includes('คะแนน') || q.includes('ดัชนี') || q.includes('score')) {
      const c = this.myCoaching();
      this.coachReply.set({
        query: raw,
        headline: `ดัชนีปัจจุบัน ${this.view().indexLabel} / เป้า ${this.view().target}`,
        detail: c
          ? `ตรงเวลา ${c.onTimePct}% · แม่นยำ ${c.estimationAccuracyPct}% · รีวิวรอบแรก ${c.firstPassPct}% (Slope ${c.trendSlope})`
          : `ปิดงานไปแล้ว ${this.view().closedCount} ใบในรอบปัจจุบัน`,
        route: '/quality/ols',
        routeLabel: 'ดูกราฟวิเคราะห์เต็ม',
      });
      this.coachQuery.set('');
      return;
    }

    if (q.includes('โควตา') || q.includes('quota') || q.includes('md') || q.includes('ว่าง')) {
      this.coachReply.set({
        query: raw,
        headline: `โควตาสัปดาห์คงเหลือประมาณ ${this.freeMdLabel()} MD`,
        detail: `ระดับ ${this.view().level} (ฐาน ${this.view().quota} MD) · ถือใบงานเปิด ${this.view().openCount} ใบ`,
        route: '/schedule',
        routeLabel: 'เช็กปฏิทิน & วันลา',
      });
      this.coachQuery.set('');
      return;
    }

    // Search user's own tickets by ID or title
    const matchedOpen = this.dueAgenda().find(
      (item) => item.id.toLowerCase().includes(q) || item.title.toLowerCase().includes(q),
    );
    if (matchedOpen) {
      this.coachReply.set({
        query: raw,
        headline: `พบใบงานเปิด ${matchedOpen.id}`,
        detail: `${matchedOpen.title} · สถานะ ${matchedOpen.status} · กำหนดส่ง ${matchedOpen.dueLabel}`,
        ticketId: matchedOpen.id,
      });
      this.coachQuery.set('');
      return;
    }

    const matchedClosed = this.view().closedWork.find(
      (item) => item.id.toLowerCase().includes(q) || item.title.toLowerCase().includes(q),
    );
    if (matchedClosed) {
      this.coachReply.set({
        query: raw,
        headline: `พบใบงานปิดแล้ว ${matchedClosed.id}`,
        detail: `${matchedClosed.title} · ได้คะแนน ${matchedClosed.score != null ? Math.round(matchedClosed.score) : '-'} · ใช้จริง ${matchedClosed.actualMd} MD`,
        ticketId: matchedClosed.id,
      });
      this.coachQuery.set('');
      return;
    }

    this.coachReply.set({
      query: raw,
      headline: `ไม่พบใบงานที่ตรงกับ "${raw}"`,
      detail: 'ลองพิมพ์รหัสใบงาน หรือกดคำสั่งด่วน เช่น "งานไหนเสี่ยงสุด", "สรุปคะแนนฉัน", "โควตาคงเหลือ"',
      route: '/work/board',
      routeLabel: 'ไปที่บอร์ดงาน',
    });
    this.coachQuery.set('');
  }
}

interface DeliveryCheckItem {
  id: string;
  label: string;
  done: boolean;
}

function nextDeliveryAction(status: string): string {
  switch (status) {
    case 'In Progress':
    case 'Reopened':
      return 'อัปเดตความคืบหน้า / แนบ MR';
    case 'Code Review':
      return 'เร่งรีวิวหรือตอบคอมเมนต์ MR';
    case 'Ready for QA':
      return 'รอเข้าคิว QA · ตรวจหลักฐาน DoD';
    case 'In QA':
      return 'ติดตามผลทดสอบ / แก้บั๊กที่ตีกลับ';
    case 'Blocked':
      return 'ระบุบล็อกเกอร์และแจ้งทีมที่เกี่ยวข้อง';
    default:
      return 'อัปเดตสถานะบนบอร์ด';
  }
}

function deliveryChecklist(status: string, hasMr: boolean): DeliveryCheckItem[] {
  const inReviewOrLater = ['Code Review', 'Ready for QA', 'In QA', 'Done'].includes(status);
  const readyForQaOrLater = ['Ready for QA', 'In QA', 'Done'].includes(status);
  return [
    { id: 'progress', label: 'งานอยู่ในมือ / อัปเดตสถานะแล้ว', done: status !== 'To Do' && status !== 'Backlog' },
    { id: 'mr', label: 'มีลิงก์ MR', done: hasMr || inReviewOrLater },
    { id: 'review', label: 'ผ่าน / อยู่ขั้น Code Review ขึ้นไป', done: inReviewOrLater },
    { id: 'qa', label: 'พร้อมหรืออยู่ขั้น QA', done: readyForQaOrLater },
  ];
}

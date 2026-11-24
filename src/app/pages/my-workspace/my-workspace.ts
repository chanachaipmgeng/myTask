import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { currentViewer, effectiveRole, trackWeights, weeklyQuotas } from '../../core/admin-settings';
import { buildAnalyticsReport } from '../../core/analytics';
import { personDashboard } from '../../core/person-dashboard';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { ThemeService } from '../../core/theme.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { KpiStatCardComponent } from '../../shared/kpi-stat-card/kpi-stat-card';
import { MotionWrapperComponent } from '../../shared/motion/motion-wrapper';
import {
  PageHeadComponent,
  SectionCardComponent,
  SfChartComponent,
  SfChartOptions,
  SfChartSeriesConfig,
  SfGridAggregate,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
  SfMessageComponent,
  StatusBadgeComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-my-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    RouterLink,
    PageHeadComponent,
    SectionCardComponent,
    StatusBadgeComponent,
    KpiStatCardComponent,
    MotionWrapperComponent,
    SfChartComponent,
    SfGridComponent,
    SfMessageComponent,
  ],
  templateUrl: './my-workspace.html',
})
export class MyWorkspacePage {
  private readonly scorecard = inject(ScorecardService);
  private readonly ticketDetail = inject(TicketDetailService);
  protected readonly theme = inject(ThemeService);

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
      fill: '#4c68e5',
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
      marker: { visible: true, width: 8, height: 8, shape: 'Diamond', isFilled: true, fill: '#f59e0b', border: { width: 1, color: '#f59e0b' } },
    },
  ]);
  protected readonly trendChartOptions: SfChartOptions = {
    height: '260px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'my-self-trend',
    enableAnimation: true,
    legend: { visible: true, position: 'Top', alignment: 'Center', textStyle: this.axisFont },
    tooltip: { enable: true, shared: true, enableMarker: true, header: '${point.x}', format: '${series.name}: <b>${point.y}</b>' },
  };
  protected readonly openWorkColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'รหัสใบงาน', width: 120 },
    { field: 'title', headerText: 'ชื่องาน / โมดูล', width: 200 },
    { field: 'type', headerText: 'ประเภท', width: 115 },
    { field: 'size', headerText: 'ขนาด', width: 75 },
    { field: 'status', headerText: 'สถานะ', width: 125 },
    { field: 'estimateMd', headerText: 'Est MD', width: 90, textAlign: 'Right', format: 'N2' },
    { field: 'dueOnLabel', headerText: 'กำหนดส่ง', width: 115 },
    { field: 'unplannedLabel', headerText: 'แผน', width: 95 },
    { field: 'actions', headerText: 'จัดการ', width: 180, allowSorting: false },
  ];
  protected readonly openWorkGridOptions: SfGridOptions = listGridOptions({
    id: 'my-open-work-grid',
    height: '260',
  });
  protected readonly closedWorkColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'ใบงาน', width: 110 },
    { field: 'title', headerText: 'เรื่อง', width: 'auto', minWidth: 150 },
    { field: 'type', headerText: 'ประเภท', width: 100 },
    { field: 'size', headerText: 'ขนาด', width: 68 },
    { field: 'estimateMd', headerText: 'Est', width: 76, textAlign: 'Right', format: 'N2' },
    { field: 'actualMd', headerText: 'Actual', width: 78, textAlign: 'Right', format: 'N2' },
    { field: 'weekOffsetLabel', headerText: 'สัปดาห์', width: 100 },
    { field: 'reviewRounds', headerText: 'รีวิว', width: 72, textAlign: 'Right' },
    { field: 'reopenCount', headerText: 'Reopen', width: 78, textAlign: 'Right' },
    { field: 'score', headerText: 'คะแนน', width: 88, textAlign: 'Right' },
  ];
  protected readonly closedWorkAggregates: SfGridAggregate[] = [
    { field: 'id', type: 'Count', prefix: 'รวม ', suffix: ' ใบ' },
    { field: 'actualMd', type: 'Sum', format: 'N2', prefix: 'รวม ', suffix: ' MD' },
    { field: 'score', type: 'Average', format: 'N1', prefix: 'เฉลี่ย ' },
  ];
  protected readonly closedWorkGridOptions: SfGridOptions = listGridOptions({
    id: 'my-closed-work-grid',
    height: '280',
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

  /** Agenda งานเปิดเรียงตามกำหนดส่ง + checklist ส่งมอบถัดไป */
  protected readonly dueAgenda = computed(() => {
    const personId = this.activePerson()?.id ?? '';
    return this.scorecard
      .tickets()
      .filter((ticket) => !ticket.closed && ticket.assigneeId === personId)
      .map((ticket) => {
        const dueKey = ticket.dueOn ?? ticket.firstDueOn ?? '';
        const status = ticket.workflowStatus ?? 'In Progress';
        return {
          id: ticket.id,
          title: ticket.title?.trim() || ticket.module,
          status,
          estimateMd: ticket.estimateMd,
          dueKey,
          dueLabel: dueKey || 'ไม่ระบุกำหนดส่ง',
          slipped: ticket.weekOffset > 0,
          weekOffset: ticket.weekOffset,
          nextAction: nextDeliveryAction(status),
          checklist: deliveryChecklist(status, !!ticket.mrLink?.trim()),
        };
      })
      .sort((a, b) => {
        if (!a.dueKey && !b.dueKey) {
          return a.id.localeCompare(b.id);
        }
        if (!a.dueKey) {
          return 1;
        }
        if (!b.dueKey) {
          return -1;
        }
        return a.dueKey.localeCompare(b.dueKey) || a.id.localeCompare(b.id);
      });
  });

  protected readonly freeMdLabel = computed(() => {
    const person = this.activePerson();
    if (!person) return '0.0';
    const quota = weeklyQuotas()[person.level];
    const openMd = this.view().openWork.reduce((sum, item) => sum + item.estimateMd, 0);
    const free = Math.max(0, quota - openMd - 1);
    return free.toFixed(2);
  });

  protected readonly trendSparklineData = computed<number[]>(() =>
    this.view().trend.map((t) => t.index)
  );

  protected readonly wipProgressPct = computed(() =>
    Math.min(100, Math.round((this.view().openCount / 2) * 100))
  );

  protected readonly quotaProgressPct = computed(() => {
    const person = this.activePerson();
    if (!person) return 0;
    const quota = weeklyQuotas()[person.level] || 3.5;
    const free = parseFloat(this.freeMdLabel()) || 0;
    return Math.min(100, Math.round((free / quota) * 100));
  });

  /** Agenda card reveal — เปิดแผง checklist ทับการ์ดทีละใบ (Syncfusion Card Reveal) */
  protected readonly revealedAgendaId = signal<string | null>(null);

  protected openTicket(id: string, event?: Event): void {
    event?.stopPropagation();
    if (id) this.ticketDetail.open(id);
  }

  protected openAgendaReveal(id: string): void {
    this.revealedAgendaId.set(id);
  }

  protected closeAgendaReveal(): void {
    this.revealedAgendaId.set(null);
  }

  protected checklistProgress(item: { checklist: DeliveryCheckItem[] }): string {
    const done = item.checklist.filter((check) => check.done).length;
    return `${done}/${item.checklist.length}`;
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

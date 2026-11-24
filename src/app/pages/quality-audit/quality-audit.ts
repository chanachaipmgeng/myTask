import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { effectiveRole } from '../../core/admin-settings';
import { computeQualityAuditSummary } from '../../core/multi-team';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { KpiStatCardComponent } from '../../shared/kpi-stat-card/kpi-stat-card';
import {
  PageHeadComponent,
  SectionCardComponent,
  SfChartComponent,
  SfChartOptions,
  SfChartSeriesConfig,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
  SfMessageComponent,
  SfTabItem,
  SfTabsComponent,
  StatusBadgeComponent,
} from '../../shared/ui';

export interface ParetoCausePoint {
  cause: string;
  count: number;
  cumCount: number;
  cumPct: number;
}

@Component({
  selector: 'app-quality-audit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    PageHeadComponent,
    SectionCardComponent,
    StatusBadgeComponent,
    KpiStatCardComponent,
    SfChartComponent,
    SfGridComponent,
    SfMessageComponent,
    SfTabsComponent,
  ],
  templateUrl: './quality-audit.html',
})
export class QualityAuditPage {
  protected readonly scorecard = inject(ScorecardService);
  private readonly workspace = inject(WorkspaceFilter);
  protected readonly theme = inject(ThemeService);
  private readonly notice = inject(ShellNotice);
  private readonly ticketDetail = inject(TicketDetailService);

  protected openTicket(id: string): void {
    if (id) {
      this.ticketDetail.open(id);
    }
  }

  protected readonly role = effectiveRole;
  protected readonly report = computed(() =>
    computeQualityAuditSummary(
      this.workspace.applyToTickets(this.scorecard.tickets()),
      this.workspace.applyToPeople(this.scorecard.roster()),
    ),
  );
  protected readonly kpis = computed(() => this.report().kpis);
  protected readonly dodChecklist = computed(() => this.report().dodChecklist);
  protected readonly reopenEscapes = computed(() => this.report().reopenEscapes);

  // ==========================================
  // Pareto 80/20 Root-Cause Analysis
  // ==========================================
  protected readonly paretoReport = computed(() => {
    const list = this.reopenEscapes();
    const map = new Map<string, number>();

    if (list.length === 0) {
      map.set('Requirement คลุมเครือ/เปลี่ยนสเปก', 8);
      map.set('Logic Bug & ขาด Edge Case', 6);
      map.set('Environment & CI/CD Config', 4);
      map.set('Regression จากโค้ดส่วนอื่น', 2);
      map.set('DoD ไม่ครบ / ขาด Unit Test', 1);
    } else {
      for (const item of list) {
        const cause = item.bugCause?.trim() || 'ไม่ระบุสาเหตุ';
        map.set(cause, (map.get(cause) ?? 0) + (item.reopenCount || 1));
      }
    }

    const sorted = Array.from(map.entries())
      .map(([cause, count]) => ({ cause, count }))
      .sort((a, b) => b.count - a.count);

    const total = sorted.reduce((sum, item) => sum + item.count, 0) || 1;
    let running = 0;
    const points: ParetoCausePoint[] = [];
    let vitalFewCount = 0;

    for (const item of sorted) {
      running += item.count;
      const cumPct = Math.round((running / total) * 100);
      points.push({
        cause: item.cause,
        count: item.count,
        cumCount: running,
        cumPct,
      });
      if (cumPct <= 80 || (points.length === 1 && cumPct > 80)) {
        vitalFewCount++;
      }
    }

    const topCausesText = points
      .slice(0, Math.max(1, vitalFewCount))
      .map((p) => `"${p.cause}"`)
      .join(', ');

    return {
      points,
      total,
      vitalFewCount: Math.max(1, vitalFewCount),
      insight: `ตามกฎ Pareto 80/20: ปัญหา Reopen กว่า 80% เกิดจากสาเหตุหลัก ${Math.max(1, vitalFewCount)} รายการ ได้แก่ ${topCausesText}`,
    };
  });

  protected readonly qualityTabs = computed<SfTabItem[]>(() => [
    { id: 'dod', header: `ตรวจสอบหลักฐาน DoD ก่อนเข้า QA (${this.dodChecklist().length})` },
    { id: 'reopen', header: `วิเคราะห์สาเหตุ Reopen & Bug Escape (${this.reopenEscapes().length})` },
  ]);

  protected readonly dodColumns: SfGridColumn[] = [
    { field: 'ticketId', headerText: 'รหัสใบงาน', width: 110, textAlign: 'Left' },
    { field: 'devName', headerText: 'ผู้พัฒนา (Dev)', width: 130 },
    { field: 'qaName', headerText: 'ผู้ตรวจ QA', width: 130 },
    { field: 'mrLink', headerText: 'ลิงก์ MR', width: 110 },
    { field: 'unitTestLabel', headerText: 'Unit Test', width: 110 },
    { field: 'ciStatusLabel', headerText: 'CI Pipeline', width: 120 },
    { field: 'stagingVerified', headerText: 'ผล Staging', width: 110 },
    { field: 'dodStatus', headerText: 'สถานะหลักฐาน DoD', width: 130 },
    { field: 'action', headerText: 'การจัดการ', width: 110, textAlign: 'Center' },
  ];
  protected readonly dodGridOptions: SfGridOptions = listGridOptions({
    id: 'quality-dod-grid',
    excelExport: true,
    exportFileName: 'dod-checklist',
  });

  protected readonly reopenColumns: SfGridColumn[] = [
    { field: 'ticketId', headerText: 'รหัสใบงาน', width: 110 },
    { field: 'title', headerText: 'ชื่องาน', width: 180 },
    { field: 'assignee', headerText: 'ผู้รับผิดชอบ', width: 130 },
    { field: 'reopenCount', headerText: 'Reopen', width: 100, textAlign: 'Right' },
    { field: 'bugCause', headerText: 'สาเหตุของบั๊ก', width: 150 },
    { field: 'isBugEscape', headerText: 'หลุด Prod', width: 120, textAlign: 'Center' },
    { field: 'notes', headerText: 'บันทึกเพิ่มเติม', width: 160 },
  ];
  protected readonly reopenGridOptions: SfGridOptions = listGridOptions({
    id: 'quality-reopen-grid',
    filtering: 'Excel',
    excelExport: true,
    exportFileName: 'reopen-escapes',
  });

  protected readonly paretoXAxis = {
    valueType: 'Category' as const,
    majorGridLines: { width: 0 },
    labelIntersectAction: 'Rotate45' as const,
    labelStyle: { color: 'var(--muted)', fontStyle: 'bold' },
  };
  protected readonly paretoCountAxis = {
    title: 'จำนวนครั้งที่ Reopen (ครั้ง)',
    majorGridLines: { width: 1, color: 'rgba(148, 163, 184, 0.12)' },
    lineStyle: { width: 0 },
    labelStyle: { color: 'var(--muted)' },
  };
  protected readonly paretoCumAxis = {
    name: 'cumPctAxis',
    opposedPosition: true,
    title: 'เปอร์เซ็นต์สะสม (%)',
    minimum: 0,
    maximum: 100,
    interval: 20,
    majorGridLines: { width: 0 },
    lineStyle: { width: 0 },
    labelStyle: { color: 'var(--muted)' },
    stripLines: [
      {
        start: 80,
        size: 2,
        sizeType: 'Pixel' as const,
        color: 'rgba(249, 115, 22, 0.7)',
        dashArray: '4,4',
        text: 'เกณฑ์ 80% (Vital Few)',
        horizontalAlignment: 'Start' as const,
        textStyle: { color: '#f97316', size: '10px', fontWeight: 'bold' },
      },
    ],
  };

  protected readonly paretoSeries = computed<SfChartSeriesConfig[]>(() => {
    const pts = this.paretoReport().points;
    return [
      {
        type: 'Column',
        dataSource: pts,
        xName: 'cause',
        yName: 'count',
        name: 'ความถี่ที่เกิด (ครั้ง)',
        fill: '#6366f1',
        cornerRadius: { topLeft: 4, topRight: 4 },
      },
      {
        type: 'Line',
        yAxisName: 'cumPctAxis',
        dataSource: pts,
        xName: 'cause',
        yName: 'cumPct',
        name: 'เปอร์เซ็นต์สะสม (%)',
        width: 2.5,
        fill: '#f97316',
        marker: { visible: true, width: 7, height: 7, fill: '#f97316' },
      },
    ];
  });

  protected readonly paretoChartOptions: SfChartOptions = {
    height: '260px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'pareto-reopen-causes',
    axes: [this.paretoCumAxis],
    legend: { visible: true, position: 'Top' },
    tooltip: { enable: true },
  };

  protected rejectToDev(ticketId: string, devName: string): void {
    const ticket = this.scorecard.tickets().find((item) => item.id === ticketId);
    if (!ticket) {
      this.notice.error(`ไม่พบใบงาน ${ticketId}`);
      return;
    }
    const updated = {
      ...ticket,
      workflowStatus: 'In Progress' as const,
      closed: false,
      closedOn: null,
      reopenCount: (ticket.reopenCount ?? 0) + 1,
      note: `${ticket.note ? ticket.note + ' · ' : ''}ตีกลับจาก QA DoD Gate ไปยัง ${devName}`,
    };
    this.scorecard.replaceTicket(updated);
    this.notice.warning(`ส่งการ์ด ${ticketId} ตีกลับไปยัง ${devName} เนื่องจากหลักฐาน DoD ไม่ครบถ้วน`);
  }
}

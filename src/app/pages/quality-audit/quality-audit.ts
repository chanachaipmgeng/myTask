import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  CategoryService,
  ChartModule,
  ColumnSeriesService,
  LegendService,
  LineSeriesService,
  StripLineService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import {
  FilterService,
  GridComponent,
  GridModule,
  PageService,
  SortService,
} from '@syncfusion/ej2-angular-grids';
import { TabModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { effectiveRole } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge';

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
    ChartModule,
    GridModule,
    PageHeadComponent,
    TabModule,
    MessageModule,
    SectionCardComponent,
    StatusBadgeComponent,
  ],
  providers: [
    PageService,
    SortService,
    FilterService,
    CategoryService,
    ColumnSeriesService,
    LineSeriesService,
    TooltipService,
    LegendService,
    StripLineService,
  ],
  templateUrl: './quality-audit.html',
})
export class QualityAuditPage {
  protected readonly scorecard = inject(ScorecardService);
  protected readonly theme = inject(ThemeService);
  private readonly notice = inject(ShellNotice);

  protected readonly role = effectiveRole;
  protected readonly report = this.scorecard.qualityAuditReport;
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

  protected readonly chartArea = { border: { width: 0 } };
  protected readonly paretoXAxis = {
    valueType: 'Category',
    majorGridLines: { width: 0 },
    labelIntersectAction: 'Rotate45',
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
        value: 80,
        color: 'rgba(249, 115, 22, 0.7)',
        width: 2,
        dashArray: '4,4',
        text: 'เกณฑ์ 80% (Vital Few)',
        horizontalAlignment: 'Start' as const,
        textStyle: { color: '#f97316', size: '10px', fontWeight: 'bold' },
      },
    ],
  };
  protected readonly tooltip = { enable: true };
  protected readonly legend = { visible: true, position: 'Top' };

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

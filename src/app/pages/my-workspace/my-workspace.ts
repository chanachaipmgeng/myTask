import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  CategoryService,
  ChartModule,
  LegendService,
  LineSeriesService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { AggregateService, GridModule, PageService, ResizeService, SortService } from '@syncfusion/ej2-angular-grids';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { currentViewer, effectiveRole, trackWeights, weeklyQuotas } from '../../core/admin-settings';
import { buildAnalyticsReport } from '../../core/analytics';
import { personDashboard } from '../../core/person-dashboard';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { ThemeService } from '../../core/theme.service';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge';

@Component({
  selector: 'app-my-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    ChartModule,
    GridModule,
    MessageModule,
    RouterLink,
    PageHeadComponent,
    SectionCardComponent,
    StatusBadgeComponent,
  ],
  providers: [
    CategoryService,
    LineSeriesService,
    LegendService,
    TooltipService,
    PageService,
    SortService,
    ResizeService,
    AggregateService,
  ],
  templateUrl: './my-workspace.html',
})
export class MyWorkspacePage {
  private readonly scorecard = inject(ScorecardService);
  protected readonly theme = inject(ThemeService);

  protected readonly role = effectiveRole;
  protected readonly pageSettings = { pageSize: 6 };
  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' };
  protected readonly categoryAxis = {
    valueType: 'Category',
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
    fill: '#f59e0b',
    border: { width: 1, color: '#f59e0b' },
  };

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

  /** Agenda card reveal — เปิดแผง checklist ทับการ์ดทีละใบ (Syncfusion Card Reveal) */
  protected readonly revealedAgendaId = signal<string | null>(null);

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

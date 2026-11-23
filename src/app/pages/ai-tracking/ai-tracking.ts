import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { currentViewer } from '../../core/admin-settings';
import { acceptedTrackedMd, aiTicketPoints, formatTrackedMd, researchSpikeShare } from '../../core/ai-tracking';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { WorkspaceFilter } from '../../core/workspace-filter';
import {
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  SfChartComponent,
  SfChartOptions,
  SfChartSeriesConfig,
  SfGridAggregate,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
  SfProgressComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-ai-tracking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeadComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    SfChartComponent,
    SfGridComponent,
    SfProgressComponent,
  ],
  templateUrl: './ai-tracking.html',
})
export class AiTrackingPage {
  private readonly route = inject(ActivatedRoute);
  private readonly scorecard = inject(ScorecardService);
  private readonly workspace = inject(WorkspaceFilter);

  protected readonly isMine = this.route.snapshot.data['scope'] === 'mine';
  protected readonly activePersonId = computed(
    () => currentSession()?.person.id ?? currentViewer().id,
  );
  protected readonly scopedTickets = computed(() => {
    const all = this.scorecard.tickets();
    if (this.isMine) {
      const selfId = this.activePersonId();
      return all.filter((t) => t.assigneeId === selfId);
    }
    return this.workspace.applyToTickets(all);
  });
  protected readonly scopedPeople = computed(() => {
    const all = this.scorecard.people();
    if (this.isMine) {
      const selfId = this.activePersonId();
      return all.filter((p) => p.id === selfId);
    }
    return this.workspace.applyToPeople(all);
  });

  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' };
  protected readonly categoryAxis = {
    valueType: 'Category' as const,
    majorGridLines: { width: 0 },
    labelRotation: -40,
    labelIntersectAction: 'Rotate45' as const,
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
  protected readonly chartOptions: SfChartOptions = {
    height: '320px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'ai-spike-md',
    enableAnimation: true,
    tooltip: { enable: true, shared: true, header: '${point.x}', format: '${series.name}: <b>${point.y}</b>' },
  };

  protected readonly points = computed(() => {
    const peopleById = new Map(this.scorecard.roster().map((p) => [p.id, p]));
    const ticketById = new Map(this.scopedTickets().map((t) => [t.id, t]));
    return aiTicketPoints(this.scopedTickets()).map((pt) => {
      const ticket = ticketById.get(pt.id);
      const assigneeId = ticket?.assigneeId ?? null;
      const person = assigneeId ? peopleById.get(assigneeId) : undefined;
      return {
        ...pt,
        assigneeId,
        assigneeName: person?.nickname || person?.fullName || assigneeId || 'ยังไม่ระบุ',
      };
    });
  });

  protected readonly chartSeries = computed<SfChartSeriesConfig[]>(() => [
    {
      type: 'Column',
      dataSource: this.points(),
      xName: 'id',
      yName: 'md',
      name: 'MD',
      columnWidth: 0.55,
      fill: '#4c68e5',
      cornerRadius: { topLeft: 6, topRight: 6 },
    },
  ]);

  protected readonly gridColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'รหัส', width: 120 },
    { field: 'assigneeName', headerText: 'ผู้รับผิดชอบ', width: 165 },
    { field: 'module', headerText: 'โมดูล / หัวข้อ', width: 195 },
    { field: 'md', headerText: 'MD', width: 95, textAlign: 'Right', format: 'N2' },
  ];

  protected readonly gridAggregates: SfGridAggregate[] = [
    { field: 'id', type: 'Count', prefix: 'รวม ', suffix: ' ใบ' },
    { field: 'md', type: 'Sum', format: 'N2', prefix: 'รวม ', suffix: ' MD' },
  ];

  protected readonly gridOptions: SfGridOptions = listGridOptions({
    id: 'ai-tickets-grid',
    filtering: 'Excel',
    excelExport: true,
    csvExport: true,
    height: '320px',
    exportFileName: 'ai-spike-tickets',
  });

  protected readonly share = computed(() => researchSpikeShare(this.scopedPeople(), this.scopedTickets()));
  protected readonly sharePct = computed(() => Math.min(100, Math.round(this.share().ratio * 100)));
  protected readonly acceptedMd = computed(() => formatTrackedMd(acceptedTrackedMd(this.scopedTickets())));
  protected readonly trackedMd = computed(() =>
    formatTrackedMd(this.points().reduce((sum, point) => sum + point.md, 0)),
  );
}

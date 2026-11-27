import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { computeHandoffSlaSummary } from '../../../../shared/domain/multi-team';
import { listWorkspaceTrackChipOptions } from '../../../../shared/domain/workspace-scope';
import { effectiveRole } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import {
  BadgeTone,
  FilterChipOption,
  FilterChipsComponent,
  FormFieldComponent,
  PageHeadComponent,
  SectionCardComponent,
  StatusBadgeComponent,
} from '../../shared/ui';
import { SfChartComponent, SfChartOptions, SfChartSeriesConfig } from '../../shared/sf/sf-chart/sf-chart';
import { SfDropdownComponent } from '../../shared/sf/sf-dropdown/sf-dropdown';
import {
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
} from '../../shared/sf/sf-grid/sf-grid';
import { SfMessageComponent } from '../../shared/sf/sf-message/sf-message';

@Component({
  selector: 'app-work-handoff',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    PageHeadComponent,
    SectionCardComponent,
    StatusBadgeComponent,
    FormFieldComponent,
    FilterChipsComponent,
    SfChartComponent,
    SfDropdownComponent,
    SfGridComponent,
    SfMessageComponent,
  ],
  templateUrl: './work-handoff.html',
})
export class WorkHandoffPage {
  protected readonly scorecard = inject(ScorecardService);
  protected readonly theme = inject(ThemeService);
  private readonly notice = inject(ShellNotice);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly workspace = inject(WorkspaceFilter);

  protected readonly role = effectiveRole;
  protected readonly onlyOverSla = signal<boolean>(false);

  protected readonly trackOptions = computed(() => {
    const chips = listWorkspaceTrackChipOptions(this.scorecard.people(), this.scorecard.tickets());
    return chips.map((c) => ({
      text: c.id === 'All' ? 'สายงาน: ทั้งหมด' : `${c.label} (${c.id})`,
      value: c.id,
    }));
  });
  protected readonly slaChipOptions: FilterChipOption[] = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'over', label: 'เฉพาะที่เกิน SLA' },
  ];
  protected readonly slaChipValue = computed(() => (this.onlyOverSla() ? 'over' : 'all'));

  /** ฐานรายงานตาม Global Filter (ทีม/คน/สาย/สถานะ) */
  protected readonly report = computed(() => {
    const people = this.workspace.applyToPeople(this.scorecard.people());
    const tickets = this.workspace.applyToTickets(this.scorecard.tickets(), this.scorecard.people());
    return computeHandoffSlaSummary(tickets, this.scorecard.stageLogs(), people);
  });
  protected readonly kpis = computed(() => this.report().kpis);
  protected readonly stageAgingData = computed(() => this.report().stageAging);
  protected readonly blockerMatrix = computed(() => this.report().blockerMatrix);
  protected readonly trackFilter = computed(() => this.workspace.track());

  protected readonly filteredTickets = computed(() => {
    let list = this.report().tickets;
    if (this.onlyOverSla()) {
      list = list.filter((t) => t.isOverSla);
    }
    return list;
  });

  protected readonly primaryXAxis = {
    valueType: 'Category' as const,
    title: 'สายงาน',
    majorGridLines: { width: 0 },
  };

  protected readonly primaryYAxis = {
    title: 'ชั่วโมงเฉลี่ยสะสม (ชม.)',
    lineStyle: { width: 0 },
    majorTickLines: { width: 0 },
  };

  protected readonly stageAgingSeries = computed<SfChartSeriesConfig[]>(() => {
    const data = this.stageAgingData();
    return [
      { type: 'StackingBar', dataSource: data, xName: 'track', yName: 'inProgressHours', name: 'In Progress', fill: '#2746b3', columnWidth: 0.6 },
      { type: 'StackingBar', dataSource: data, xName: 'track', yName: 'reviewHours', name: 'Code Review', fill: '#7c3aed', columnWidth: 0.6 },
      { type: 'StackingBar', dataSource: data, xName: 'track', yName: 'qaHours', name: 'In QA', fill: '#0284c7', columnWidth: 0.6 },
      { type: 'StackingBar', dataSource: data, xName: 'track', yName: 'blockedHours', name: 'Blocked', fill: '#e11d48', columnWidth: 0.6, cornerRadius: { topRight: 4, bottomRight: 4 } },
    ];
  });

  protected readonly stageAgingOptions: SfChartOptions = {
    height: '280px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'stage-aging-by-track',
    enableAnimation: true,
    legend: { visible: true, position: 'Top', alignment: 'Center' },
    tooltip: { enable: true, shared: true, header: '${point.x}', format: '${series.name}: <b>${point.y}</b> ชม.' },
  };

  protected readonly gridColumns: SfGridColumn[] = [
    { field: 'ticketId', headerText: 'รหัสใบงาน', width: 105, textAlign: 'Left' },
    { field: 'status', headerText: 'สถานะค้าง', width: 140, textAlign: 'Left' },
    { field: 'title', headerText: 'ชื่องาน / รายละเอียด', width: 190, textAlign: 'Left' },
    { field: 'owner', headerText: 'เจ้าของงานหลัก', width: 140, textAlign: 'Left' },
    { field: 'ownerTrack', headerText: 'สายเจ้าของ', width: 100, visible: false },
    { field: 'reviewerOrQa', headerText: 'ผู้ตรวจ/ผู้รับช่วง', width: 140, textAlign: 'Left' },
    { field: 'hoursSpent', headerText: 'เวลาค้างสะสม', width: 110, textAlign: 'Right' },
    { field: 'slaHours', headerText: 'เกณฑ์ SLA', width: 95, textAlign: 'Right' },
    { field: 'action', headerText: 'การจัดการ', width: 110, textAlign: 'Center' },
  ];

  protected readonly groupBy = signal<'none' | 'track' | 'assignee' | 'status'>('none');
  protected readonly groupByChips: FilterChipOption[] = [
    { id: 'none', label: 'ไม่จัดกลุ่ม' },
    { id: 'track', label: 'ตามสาย' },
    { id: 'assignee', label: 'ตามเจ้าของงาน' },
    { id: 'status', label: 'ตามสถานะ' },
  ];

  protected readonly gridOptions = computed<SfGridOptions>(() => {
    const groupBy = this.groupBy();
    const groupField =
      groupBy === 'track'
        ? 'ownerTrack'
        : groupBy === 'assignee'
          ? 'owner'
          : groupBy === 'status'
            ? 'status'
            : '';
    return listGridOptions({
      id: 'work-handoff-grid-v2',
      filtering: 'Excel',
      columnChooser: true,
      excelExport: true,
      csvExport: true,
      autoFreezeDesktop: 2,
      exportFileName: 'handoff-sla',
      grouping: Boolean(groupField),
      groupColumns: groupField ? [groupField] : [],
    });
  });

  protected setGroupBy(id: string): void {
    if (id === 'track' || id === 'assignee' || id === 'status' || id === 'none') {
      this.groupBy.set(id);
    }
  }

  protected readonly statusToneMap: Record<string, BadgeTone> = {
    'Code Review': 'violet',
    'Ready for QA': 'coral',
    'In QA': 'info',
    blocked: 'danger',
  };

  protected setTrack(value: unknown): void {
    this.workspace.setTrack(String(value ?? 'All'));
  }

  protected toggleOverSla(): void {
    this.onlyOverSla.update((v) => !v);
  }

  protected setSlaChip(value: string): void {
    this.onlyOverSla.set(value === 'over');
  }

  /** คลิกแท่ง Stage Aging → ตั้งสายงานแล้วไปรายการงาน (สถานะจาก series) */
  protected onStageAgingClick(args: {
    point?: { x?: unknown };
    series?: { name?: string };
  }): void {
    const track = String(args.point?.x ?? '').trim();
    if (track) {
      this.workspace.setTrack(track);
    }
    const seriesName = String(args.series?.name ?? '');
    if (seriesName === 'Blocked') {
      this.onlyOverSla.set(true);
    }
    void this.workspace.navigateWithFilter(['/work/list']);
  }

  protected openTicket(id: string): void {
    if (id) this.ticketDetail.open(id);
  }

  protected pingTarget(ticketId: string, targetName: string): void {
    void this.scorecard
      .pingHandoffRecipient(ticketId, targetName, `แจ้งเตือนการส่งต่องาน ${ticketId} เกิน SLA`)
      .then((result) => {
        if (result.ok) {
          this.notice.success(result.message || `แจ้งเตือนใบงาน ${ticketId} ถึง ${targetName}`);
        } else {
          this.notice.error(result.message || `ส่งแจ้งเตือนใบงาน ${ticketId} ไม่สำเร็จ`);
        }
      });
  }
}

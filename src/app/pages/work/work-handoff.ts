import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { effectiveRole } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import {
  BadgeTone,
  FilterChipOption,
  FilterChipsComponent,
  FormFieldComponent,
  PageHeadComponent,
  SectionCardComponent,
  SfChartComponent,
  SfChartOptions,
  SfChartSeriesConfig,
  SfDropdownComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  SfMessageComponent,
  StatusBadgeComponent,
} from '../../shared/ui';

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

  protected readonly role = effectiveRole;
  protected readonly trackFilter = signal<string>('All');
  protected readonly onlyOverSla = signal<boolean>(false);

  protected readonly trackOptions = [
    { text: 'สายงาน: ทั้งหมด', value: 'All' },
    { text: 'Implement (IMP)', value: 'IMP' },
    { text: 'R&D (RND)', value: 'RND' },
    { text: 'QA / Tester', value: 'QA' },
    { text: 'UX-UI / BA', value: 'UXBA' },
    { text: 'Infra / DevOps', value: 'INFRA' },
  ];
  protected readonly slaChipOptions: FilterChipOption[] = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'over', label: 'เฉพาะที่เกิน SLA' },
  ];
  protected readonly slaChipValue = computed(() => (this.onlyOverSla() ? 'over' : 'all'));

  protected readonly report = this.scorecard.handoffReport;
  protected readonly kpis = computed(() => this.report().kpis);
  protected readonly stageAgingData = computed(() => this.report().stageAging);
  protected readonly blockerMatrix = computed(() => this.report().blockerMatrix);

  protected readonly filteredTickets = computed(() => {
    let list = this.report().tickets;
    const tf = this.trackFilter();
    if (tf !== 'All') {
      list = list.filter((t) => t.ownerTrack === tf || t.ownerTrack.includes(tf));
    }
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
      { type: 'StackingBar', dataSource: data, xName: 'track', yName: 'inProgressHours', name: 'In Progress', fill: '#4c68e5', columnWidth: 0.6 },
      { type: 'StackingBar', dataSource: data, xName: 'track', yName: 'reviewHours', name: 'Code Review', fill: '#f59e0b', columnWidth: 0.6 },
      { type: 'StackingBar', dataSource: data, xName: 'track', yName: 'qaHours', name: 'In QA', fill: '#3ec6e0', columnWidth: 0.6 },
      { type: 'StackingBar', dataSource: data, xName: 'track', yName: 'blockedHours', name: 'Blocked', fill: '#e35d6a', columnWidth: 0.6, cornerRadius: { topRight: 4, bottomRight: 4 } },
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
    { field: 'reviewerOrQa', headerText: 'ผู้ตรวจ/ผู้รับช่วง', width: 140, textAlign: 'Left' },
    { field: 'hoursSpent', headerText: 'เวลาค้างสะสม', width: 110, textAlign: 'Right' },
    { field: 'slaHours', headerText: 'เกณฑ์ SLA', width: 95, textAlign: 'Right' },
    { field: 'action', headerText: 'การจัดการ', width: 110, textAlign: 'Center' },
  ];

  protected readonly gridOptions: SfGridOptions = {
    id: 'work-handoff-grid',
    paging: true,
    pageSize: 10,
    pageSizes: [10, 25, 50],
    sorting: true,
    filtering: 'Excel',
    search: true,
    columnChooser: true,
    excelExport: true,
    csvExport: true,
    resizable: true,
    autoFreezeDesktop: 2,
    exportFileName: 'handoff-sla',
  };

  protected readonly statusToneMap: Record<string, BadgeTone> = {
    'Code Review': 'warning',
    'Ready for QA': 'info',
    'In QA': 'info',
    blocked: 'danger',
  };

  protected setTrack(value: unknown): void {
    this.trackFilter.set(String(value ?? 'All'));
  }

  protected toggleOverSla(): void {
    this.onlyOverSla.update((v) => !v);
  }

  protected setSlaChip(value: string): void {
    this.onlyOverSla.set(value === 'over');
  }

  protected pingTarget(ticketId: string, targetName: string): void {
    void this.scorecard
      .pingHandoffRecipient(ticketId, targetName, `แจ้งเตือนการส่งต่องาน ${ticketId} เกิน SLA`)
      .then((result) => {
        this.notice.success(result.message || `แจ้งเตือนใบงาน ${ticketId} ถึง ${targetName}`);
      });
  }
}

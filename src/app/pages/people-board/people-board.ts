import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { trackWeights, weeklyQuotas } from '../../core/admin-settings';
import { buildPeopleRoster } from '../../core/people-roster';
import { ScorecardService } from '../../core/scorecard.service';
import { ThemeService } from '../../core/theme.service';
import { ViewportService } from '../../core/viewport.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { INDEX_TARGET } from '../../core/scoring';
import {
  FormFieldComponent,
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
  SfTextBoxComponent,
  StatusBadgeComponent,
  toneForAlertLabel,
  trackToneMap,
  type BadgeTone,
} from '../../shared/ui';

@Component({
  selector: 'app-people-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    ButtonModule,
    RouterLink,
    PageHeadComponent,
    PersonAvatarComponent,
    StatusBadgeComponent,
    SectionCardComponent,
    FormFieldComponent,
    SfChartComponent,
    SfGridComponent,
    SfProgressComponent,
    SfTextBoxComponent,
  ],
  templateUrl: './people-board.html',
  styleUrl: './people-board.scss',
})
export class PeopleBoard {
  private readonly scorecard = inject(ScorecardService);
  private readonly router = inject(Router);
  protected readonly workspace = inject(WorkspaceFilter);
  protected readonly theme = inject(ThemeService);
  protected readonly viewport = inject(ViewportService);

  protected readonly target = INDEX_TARGET;
  protected readonly fields = { text: 'text', value: 'value' };

  protected readonly chartSeries = computed<SfChartSeriesConfig[]>(() => [
    {
      type: 'Column',
      dataSource: this.rows(),
      xName: 'nickname',
      yName: 'index',
      pointColorMapping: 'color',
      name: 'ดัชนีพัฒนา',
      columnWidth: 0.52,
      cornerRadius: { topLeft: 8, topRight: 8 },
    },
  ]);

  protected readonly chartOptions: SfChartOptions = {
    height: '420px',
    exportable: true,
    fullscreenable: true,
    exportFileName: 'people-index-chart',
    margin: { top: 14, right: 34, bottom: 28, left: 12 },
    enableAnimation: false,
  };

  protected readonly gridColumns: SfGridColumn[] = [
    { field: 'personLabel', headerText: 'พนักงาน', width: 245, isFrozen: true },
    { field: 'levelLabel', headerText: 'ระดับ', width: 110 },
    { field: 'trackLabel', headerText: 'สาย', width: 110 },
    { field: 'quota', headerText: 'โควต้า', width: 95, textAlign: 'Right', format: 'N1' },
    { field: 'openCount', headerText: 'WIP', width: 85, textAlign: 'Right' },
    { field: 'closedCount', headerText: 'ปิดแล้ว', width: 105, textAlign: 'Right' },
    { field: 'index', headerText: 'ดัชนี', width: 160 },
    { field: 'planLabel', headerText: 'ปิดตามแผน', width: 200 },
    { field: 'accuracyLabel', headerText: 'ความแม่น', width: 110 },
    { field: 'weighted', headerText: 'คะแนนถ่วง', width: 115, textAlign: 'Right', format: 'N1' },
    { field: 'reworkPct', headerText: 'Rework %', width: 115, textAlign: 'Right', format: 'N1' },
    { field: 'sideLabel', headerText: 'นอกแผน / Spike', width: 150 },
    { field: 'alertLabel', headerText: 'แจ้งเตือน', width: 160 },
  ];

  protected readonly gridAggregates: SfGridAggregate[] = [
    { field: 'personLabel', type: 'Count', prefix: 'รวม ', suffix: ' คน' },
    { field: 'quota', type: 'Sum', format: 'N1', prefix: 'รวม ' },
    { field: 'openCount', type: 'Sum', prefix: 'รวม ' },
    { field: 'closedCount', type: 'Sum', prefix: 'รวม ' },
    { field: 'index', type: 'Average', format: 'N1', prefix: 'เฉลี่ย ' },
  ];

  protected readonly gridOptions: SfGridOptions = listGridOptions({
    id: 'people-board-grid',
    sortSettings: { columns: [{ field: 'index', direction: 'Descending' }] },
    filtering: 'Menu',
    columnChooser: true,
    excelExport: true,
    csvExport: true,
    exportFileName: 'people-scorecard',
  });
  protected readonly trackToneMap = trackToneMap;
  protected readonly quotas = computed(() => {
    const quota = weeklyQuotas();
    return [
      { label: 'Senior', quota: quota.Senior },
      { label: 'Mid', quota: quota.Mid },
      { label: 'Junior', quota: quota.Junior },
      { label: 'เดือนแรก', quota: quota.FirstMonth },
    ];
  });
  protected readonly quotaMetrics = computed(() =>
    this.quotas().map((item) => ({
      label: item.label,
      value: item.quota,
      unit: 'MD',
      hint: 'โควตาต่อสัปดาห์ · ไม่เข้าสูตรดัชนี',
    })),
  );
  protected readonly query = signal('');
  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' };
  protected readonly primaryXAxis = {
    valueType: 'Category' as const,
    majorGridLines: { width: 0 },
    labelRotation: -40,
    labelIntersectAction: 'Rotate45' as const,
    labelStyle: this.axisFont,
  };
  protected readonly primaryYAxis = {
    minimum: 0,
    maximum: 100,
    title: 'ดัชนีพัฒนา',
    titleStyle: this.axisFont,
    labelStyle: this.axisFont,
    majorGridLines: { width: 1, dashArray: '4,4' },
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
    stripLines: [
      {
        start: INDEX_TARGET,
        size: 2,
        sizeType: 'Pixel' as const,
        dashArray: '6,4',
        color: '#f59e0b',
        text: `เป้า ${INDEX_TARGET}`,
        horizontalAlignment: 'End' as const,
        verticalAlignment: 'Start' as const,
        textStyle: { color: '#f59e0b', fontWeight: '700', size: '11px', fontFamily: 'Sarabun, Tahoma, sans-serif' },
      },
    ],
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
    width: 8,
    height: 8,
    shape: 'Diamond',
    isFilled: true,
    fill: '#f0b429',
    border: { width: 1, color: '#f0b429' },
  };

  private readonly roster = computed(() =>
    buildPeopleRoster(this.scorecard.roster(), this.scorecard.tickets(), {
      weights: trackWeights(),
      quotas: weeklyQuotas(),
    }),
  );

  protected readonly rows = computed(() => {
    // สายงาน/ทีมมาจาก Global Filter ผ่าน applyToPeople (normalizeTrack)
    void this.workspace.track();
    const scopedIds = new Set(this.workspace.applyToPeople(this.scorecard.people()).map((p) => p.id));
    const q = this.query().trim().toLowerCase();
    return this.roster().filter((row) => {
      if (!scopedIds.has(row.id)) {
        return false;
      }
      if (!q) {
        return true;
      }
      return `${row.nickname} ${row.role} ${row.personLabel}`.toLowerCase().includes(q);
    });
  });

  protected setQuery(event: { value?: string | null }): void {
    this.query.set(event.value ?? '');
  }

  protected openPerson(args: { data?: unknown }): void {
    const id = (args.data as { id?: string } | undefined)?.id;
    if (id) {
      void this.workspace.navigateWithFilter(['/people', id]);
    }
  }

  protected alertTone(label: string): BadgeTone {
    return toneForAlertLabel(label);
  }

  protected indexProgressFill(index: number): string {
    return index >= INDEX_TARGET ? '#10b981' : this.theme.progressFill();
  }
}

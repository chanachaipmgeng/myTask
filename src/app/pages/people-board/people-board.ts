import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CategoryService,
  ChartModule,
  ColumnSeriesService,
  LegendService,
  LineSeriesService,
  StripLineService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import {
  AggregateService,
  ColumnChooserService,
  ExcelExportService,
  FilterService,
  GridComponent,
  GridModule,
  PageService,
  ResizeService,
  SearchService,
  SortService,
  ToolbarService,
} from '@syncfusion/ej2-angular-grids';
import { ProgressBarModule } from '@syncfusion/ej2-angular-progressbar';
import { trackWeights, weeklyQuotas } from '../../core/admin-settings';
import { buildPeopleRoster } from '../../core/people-roster';
import { ScorecardService } from '../../core/scorecard.service';
import { ThemeService } from '../../core/theme.service';
import { ViewportService } from '../../core/viewport.service';
import { Track } from '../../core/models';
import { INDEX_TARGET } from '../../core/scoring';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import {
  FilterChipOption,
  FilterChipsComponent,
  FormFieldComponent,
  SectionCardComponent,
  StatusBadgeComponent,
  toneForAlertLabel,
  trackToneMap,
  type BadgeTone,
} from '../../shared/ui';

type TrackFilter = Track | 'All';

@Component({
  selector: 'app-people-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    GridModule,
    ChartModule,
    DropDownListModule,
    RouterLink,
    TextBoxModule,
    PageHeadComponent,
    ProgressBarModule,
    StatusBadgeComponent,
    SectionCardComponent,
    FormFieldComponent,
    FilterChipsComponent,
  ],
  providers: [
    PageService,
    SortService,
    FilterService,
    SearchService,
    ResizeService,
    ColumnChooserService,
    ExcelExportService,
    AggregateService,
    ToolbarService,
    ColumnSeriesService,
    LineSeriesService,
    CategoryService,
    LegendService,
    StripLineService,
    TooltipService,
  ],
  templateUrl: './people-board.html',
})
export class PeopleBoard {
  private readonly scorecard = inject(ScorecardService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);
  protected readonly viewport = inject(ViewportService);

  @ViewChild('peopleGrid') private peopleGrid?: GridComponent;

  protected readonly target = INDEX_TARGET;
  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly pageSettings = { pageSize: 16 };
  protected readonly filterSettings = { type: 'Menu' };
  protected readonly sortSettings = { columns: [{ field: 'index', direction: 'Descending' }] };
  protected readonly toolbar = ['Search', 'ColumnChooser', 'ExcelExport', 'CsvExport'];
  protected readonly trackToneMap = trackToneMap;
  protected readonly trackOptions = [
    { text: 'ทั้งหมด', value: 'All' },
    { text: 'R&D', value: 'RD' },
    { text: 'Implement', value: 'Implement' },
  ];
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
  protected readonly track = signal<TrackFilter>('All');
  protected readonly query = signal('');
  protected readonly trackChipOptions = computed<FilterChipOption[]>(() => {
    const rows = this.roster();
    const rd = rows.filter((row) => row.track === 'RD').length;
    const imp = rows.filter((row) => row.track === 'Implement').length;
    return [
      { id: 'All', label: 'ทั้งหมด', count: rows.length },
      { id: 'RD', label: 'R&D', count: rd },
      { id: 'Implement', label: 'Implement', count: imp },
    ];
  });
  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px' };
  protected readonly primaryXAxis = {
    valueType: 'Category',
    majorGridLines: { width: 0 },
    labelRotation: -40,
    labelIntersectAction: 'Rotate',
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
    const track = this.track();
    const q = this.query().trim().toLowerCase();
    return this.roster().filter((row) => {
      if (track !== 'All' && row.track !== track) {
        return false;
      }
      if (!q) {
        return true;
      }
      return `${row.nickname} ${row.role} ${row.personLabel}`.toLowerCase().includes(q);
    });
  });

  protected setTrack(event: { value?: string | null }): void {
    this.setTrackChip(event.value ?? '');
  }

  protected setTrackChip(value: string): void {
    if (value === 'All' || value === 'RD' || value === 'Implement') {
      this.track.set(value);
    }
  }

  protected setQuery(event: { value?: string | null }): void {
    this.query.set(event.value ?? '');
  }

  protected openPerson(args: { data?: { id?: string } }): void {
    const id = args.data?.id;
    if (id) {
      void this.router.navigate(['/people', id]);
    }
  }

  protected onToolbarClick(args: { item?: { id?: string } }): void {
    const id = args.item?.id ?? '';
    if (id.endsWith('_excelexport')) {
      void this.peopleGrid?.excelExport();
    } else if (id.endsWith('_csvexport')) {
      void this.peopleGrid?.csvExport();
    }
  }

  protected alertTone(label: string): BadgeTone {
    return toneForAlertLabel(label);
  }

  protected indexProgressFill(index: number): string {
    return index >= INDEX_TARGET ? '#10b981' : this.theme.progressFill();
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CategoryService,
  ChartModule,
  ColumnSeriesService,
  LegendService,
  LineSeriesService,
  TooltipService,
} from '@syncfusion/ej2-angular-charts';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { FilterService, GridModule, PageService, SortService, SearchService } from '@syncfusion/ej2-angular-grids';
import { trackWeights, weeklyQuotas } from '../../core/admin-settings';
import { buildPeopleRoster } from '../../core/people-roster';
import { ScorecardService } from '../../core/scorecard.service';
import { Track } from '../../core/models';
import { INDEX_TARGET } from '../../core/scoring';

type TrackFilter = Track | 'All';

@Component({
  selector: 'app-people-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GridModule, ChartModule, DropDownListModule, RouterLink, TextBoxModule],
  providers: [
    PageService,
    SortService,
    FilterService,
    SearchService,
    ColumnSeriesService,
    LineSeriesService,
    CategoryService,
    LegendService,
    TooltipService,
  ],
  templateUrl: './people-board.html',
})
export class PeopleBoard {
  private readonly scorecard = inject(ScorecardService);
  private readonly router = inject(Router);

  protected readonly target = INDEX_TARGET;
  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly pageSettings = { pageSize: 16 };
  protected readonly filterSettings = { type: 'Menu' };
  protected readonly sortSettings = { columns: [{ field: 'index', direction: 'Descending' }] };
  protected readonly toolbar = ['Search'];
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
  protected readonly track = signal<TrackFilter>('All');
  protected readonly query = signal('');
  protected readonly axisFont = { fontFamily: 'Sarabun, Tahoma, sans-serif', size: '12px', color: '#d7e7f5' };
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
    majorTickLines: { width: 0 },
    lineStyle: { width: 0 },
  };
  protected readonly tooltip = { enable: true, shared: true };
  protected readonly legend = { visible: true, position: 'Top', textStyle: this.axisFont };
  protected readonly chartArea = { border: { width: 0 } };
  protected readonly marker = { visible: true, width: 8, height: 8, fill: '#f0b429' };

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
    const value = event.value;
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

  protected paintIndex(args: { column?: { field?: string }; data?: { index?: number }; cell?: HTMLElement }): void {
    if (args.column?.field !== 'index' || !args.cell || typeof args.data?.index !== 'number') {
      return;
    }
    args.cell.style.color = args.data.index >= INDEX_TARGET ? '#7ee7f7' : '#ff8b7a';
    args.cell.style.fontWeight = '700';
  }
}

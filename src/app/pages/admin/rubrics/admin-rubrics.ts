import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { ApiClient } from '../../../core/api-client';
import { DEFAULT_RUBRICS, RubricDefinition } from '../../../core/rubrics';
import { ScorecardService } from '../../../core/scorecard.service';
import { ThemeService } from '../../../core/theme.service';
import {
  FlashMessagesComponent,
  KpiStatCardComponent,
  PageHeadComponent,
  SectionCardComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
} from '../../../shared/ui';

interface RubricGridRow {
  rubric_id: string;
  category: string;
  title: string;
  description: string;
  paramsSummary: string;
  paramsJson: string;
  is_active: boolean;
  version: string;
}

@Component({
  selector: 'app-admin-rubrics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    PageHeadComponent,
    KpiStatCardComponent,
    RouterLink,
    SectionCardComponent,
    FlashMessagesComponent,
    SfGridComponent,
  ],
  templateUrl: './admin-rubrics.html',
})
export class AdminRubricsPage implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly scorecard = inject(ScorecardService);
  protected readonly theme = inject(ThemeService);

  protected readonly rubrics = signal<RubricGridRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly saveNotice = signal<string | null>(null);

  protected readonly columns: SfGridColumn[] = [
    { field: 'rubric_id', headerText: 'รหัส Rubric', width: 120, isPrimaryKey: true },
    { field: 'category', headerText: 'หมวดหมู่', width: 105, allowEditing: false, textAlign: 'Center' },
    { field: 'title', headerText: 'ชื่อเกณฑ์', width: 170 },
    { field: 'paramsSummary', headerText: 'สรุปพารามิเตอร์คำนวณ', width: 210, allowEditing: false },
    { field: 'paramsJson', headerText: 'พารามิเตอร์ JSON (แก้ไขได้)', width: 210 },
    { field: 'is_active', headerText: 'เปิดใช้งาน', width: 90, displayAsCheckBox: true, type: 'boolean', textAlign: 'Center' },
    { field: 'version', headerText: 'เวอร์ชัน', width: 90, allowEditing: false, textAlign: 'Center' },
  ];

  protected readonly gridOptions: SfGridOptions = listGridOptions({
    id: 'admin-rubrics-grid',
    paging: false,
    allowTextWrap: true,
    excelExport: true,
    gridLines: 'Both',
    exportFileName: 'rubric-registry',
    editSettings: { allowEditing: true, mode: 'Normal', allowEditOnDblClick: true },
    extraToolbar: ['Edit', 'Update', 'Cancel'],
  });

  async ngOnInit(): Promise<void> {
    await this.loadRubrics();
  }

  protected async loadRubrics(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.api.getRubrics();
      const list = res?.rubrics?.length ? res.rubrics : Object.values(DEFAULT_RUBRICS);
      this.scorecard.setRubrics(list);
      this.rubrics.set(this.transformRows(list));
    } catch {
      this.rubrics.set(this.transformRows(Object.values(DEFAULT_RUBRICS)));
    } finally {
      this.loading.set(false);
    }
  }

  private transformRows(list: RubricDefinition[]): RubricGridRow[] {
    return list.map((r) => ({
      rubric_id: r.rubric_id,
      category: r.category,
      title: r.title,
      description: r.description,
      paramsSummary: this.formatParamsSummary(r.category, r.params),
      paramsJson: JSON.stringify(r.params, null, 2),
      is_active: r.is_active,
      version: r.version || 'v2026.4',
    }));
  }

  private formatParamsSummary(category: string, params: any): string {
    if (!params) return '-';
    if (category === 'SIZING') {
      const sp = params.story_point ?? '-';
      const md = params.base_md ?? '-';
      const tol = params.tolerance_mode === 'ABSOLUTE' ? `±${params.tol_md ?? 0.5} MD` : `[${params.min_ratio ?? 0.8}, ${params.max_ratio ?? 1.5}]`;
      return `SP: ${sp} | Base: ${md} MD | Tol: ${tol}`;
    }
    if (category === 'TICKET_SCORE') {
      return `OnTime: ${params.ontime_weight}% | Acc: ${params.accuracy_weight}% | Review: ${params.review_weight}% | Reopen: ${params.reopen_weight}%`;
    }
    if (category === 'PERSON_INDEX') {
      return `DoD: ${params.dod_weight * 100}% | Spike: ${params.spike_weight * 100}% | Quota: ${params.quota_weight * 100}% | Target: ${params.target_score}`;
    }
    return JSON.stringify(params);
  }

  protected async onActionComplete(args: any): Promise<void> {
    if (args.requestType === 'save') {
      const row = args.data as RubricGridRow;
      let parsedParams = {};
      try {
        parsedParams = JSON.parse(row.paramsJson);
      } catch {
        parsedParams = {};
      }
      try {
        const patch: Partial<RubricDefinition> = {
          title: row.title,
          description: row.description,
          is_active: row.is_active,
          params: parsedParams,
        };
        const res = await this.api.updateRubric(row.rubric_id, patch);
        if (res.ok) {
          this.saveNotice.set(`บันทึกเกณฑ์ ${row.rubric_id} (${row.title}) เรียบร้อยแล้ว`);
          setTimeout(() => this.saveNotice.set(null), 4000);
          await this.loadRubrics();
        }
      } catch (err: any) {
        this.saveNotice.set(`เกิดข้อผิดพลาดในการบันทึก: ${err.message || String(err)}`);
      }
    }
  }
}

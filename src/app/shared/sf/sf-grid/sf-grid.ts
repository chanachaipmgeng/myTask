import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  ViewChild,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import {
  AggregateRowModel,
  AggregateService,
  ColumnChooserService,
  DataStateChangeEventArgs,
  EditService,
  EditSettingsModel,
  ExcelExportService,
  FilterService,
  FilterSettingsModel,
  FilterType,
  FreezeService,
  GridComponent,
  GridLine,
  GridModule,
  GroupService,
  GroupSettingsModel,
  PageService,
  PageSettingsModel,
  ReorderService,
  ResizeService,
  RowDataBoundEventArgs,
  RowSelectEventArgs,
  SearchService,
  SortService,
  SortSettingsModel,
  TextWrapSettingsModel,
  ToolbarItems,
  ToolbarService,
} from '@syncfusion/ej2-angular-grids';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { ClickEventArgs } from '@syncfusion/ej2-navigations';
import { ViewportService } from '../../../core/viewport.service';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';
import { BadgeTone } from '../../ui/badge';
import { formatDateOnly, formatDateTime } from '../../ui/date-format';
import { PersonAvatarComponent } from '../../ui/person-avatar/person-avatar';
import { StatusBadgeComponent } from '../../ui/status-badge/status-badge';

export type SfGridCellType =
  | 'person'
  | 'badge'
  | 'progress'
  | 'score'
  | 'ticket-link'
  | 'metric'
  | 'date'
  | 'datetime'
  | 'code'
  | 'link'
  | 'boolean'
  | 'delta'
  | 'title-sub';

export interface SfGridColumn {
  field?: string;
  headerText: string;
  width?: number | string;
  minWidth?: number | string;
  textAlign?: 'Left' | 'Right' | 'Center' | 'Justify';
  format?: string;
  type?: 'string' | 'number' | 'boolean' | 'date' | 'datetime';
  visible?: boolean;
  allowFiltering?: boolean;
  allowSorting?: boolean;
  allowGrouping?: boolean;
  allowEditing?: boolean;
  isPrimaryKey?: boolean;
  displayAsCheckBox?: boolean;
  isFrozen?: boolean;
  /** Built-in standardized cell renderer (overridden if cellTemplates[key] is provided) */
  cellType?: SfGridCellType;
  /** For cellType: 'person' — optional field holding personId (defaults to 'personId') */
  personIdField?: string;
  /** For cellType: 'badge' — custom value-to-tone mapping */
  toneMap?: Record<string, BadgeTone>;
  /** For cellType: 'badge' — fixed badge tone */
  badgeTone?: BadgeTone;
  /** For cellType: 'metric' | 'progress' | 'score' | 'delta' — optional suffix (e.g. ' MD', '%') */
  suffix?: string;
  /** For cellType: 'title-sub' — field holding the secondary muted subtitle */
  subtitleField?: string;
  /** For cellType: 'code' | 'link' — optional field holding external URL */
  linkField?: string;
  /** For cellType: 'link' — label shown for valid links (defaults to 'เปิดลิงก์') */
  linkLabel?: string;
  /** For cellType: 'boolean' — custom labels (defaults to 'ผ่าน' / 'ไม่ผ่าน') */
  trueLabel?: string;
  falseLabel?: string;
  /** Key in [cellTemplates] map; defaults to `field` when omitted */
  templateKey?: string;
}

export interface SfGridAggregate {
  field: string;
  type: 'Sum' | 'Count' | 'Average' | 'Min' | 'Max';
  format?: string;
  prefix?: string;
  suffix?: string;
}

export interface SfGridOptions {
  id?: string;
  paging?: boolean;
  pageSize?: number;
  pageSizes?: boolean | number[];
  sorting?: boolean;
  sortSettings?: SortSettingsModel;
  filtering?: boolean | FilterType;
  grouping?: boolean;
  groupColumns?: string[];
  search?: boolean;
  columnChooser?: boolean;
  excelExport?: boolean;
  csvExport?: boolean;
  exportFileName?: string;
  resizable?: boolean;
  reorderable?: boolean;
  allowTextWrap?: boolean;
  enablePersistence?: boolean;
  /** Adaptive frozen columns on desktop (automatically 1 on tablet, 0 on mobile) */
  autoFreezeDesktop?: number;
  height?: string | number;
  density?: 'compact' | 'default' | 'comfortable';
  rowHeight?: number;
  gridLines?: GridLine;
  editSettings?: EditSettingsModel;
  extraToolbar?: (string | object)[];
  motion?: MotionInput;
  /**
   * Syncfusion custom remote binding — ผูก `(dataStateChange)` และส่ง
   * `data` เป็น `{ result, count }` จาก API มาตรฐาน ListPageResult
   */
  remote?: boolean;
}

/** รูปแบบ dataSource สำหรับ Syncfusion custom binding */
export type SfGridRemoteData<T extends object = object> = {
  result: T[];
  count: number;
};

/** ขนาดหน้ามาตรฐานสำหรับรายการตารางปฏิบัติการ */
export const LIST_PAGE_SIZES = [12, 25, 50, 100] as const;

/**
 * ตัวเลือกตารางรายการมาตรฐาน: ค้นหา · แบ่งหน้า · เรียง · ปรับคอลัมน์
 * ส่งทับเฉพาะฟิลด์ที่หน้าต้องการ (เช่น `search: false` เมื่อมีช่องค้นหาด้านนอกแล้ว)
 */
export function listGridOptions(overrides: SfGridOptions = {}): SfGridOptions {
  return {
    paging: true,
    pageSize: 25,
    pageSizes: [...LIST_PAGE_SIZES],
    sorting: true,
    search: true,
    resizable: true,
    ...overrides,
  };
}

let nextGridId = 1;

@Component({
  selector: 'app-sf-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    GridModule,
    ButtonModule,
    PersonAvatarComponent,
    StatusBadgeComponent,
    MotionWrapperComponent,
  ],
  providers: [
    PageService,
    SortService,
    FilterService,
    SearchService,
    GroupService,
    ResizeService,
    FreezeService,
    ColumnChooserService,
    ExcelExportService,
    ToolbarService,
    AggregateService,
    ReorderService,
    EditService,
  ],
  template: `
    <app-motion-wrapper
      [config]="options().motion"
      variant="fade-up"
      [refreshKey]="motionRefreshKey()"
    >
    <div class="sf-grid-host" [attr.data-density]="density()">
      <ejs-grid
        #gridRef
        [id]="gridId()"
        [dataSource]="gridDataSource()"
        [allowPaging]="paging()"
        [pageSettings]="pageSettings()"
        [allowSorting]="sorting()"
        [sortSettings]="sortSettings()"
        [allowFiltering]="filteringEnabled()"
        [filterSettings]="filterSettings()"
        [allowGrouping]="grouping()"
        [groupSettings]="groupSettings()"
        [allowResizing]="resizable()"
        [allowReordering]="reorderable() && adaptiveFrozenColumns() === 0"
        [allowTextWrap]="allowTextWrap()"
        [textWrapSettings]="textWrapSettings"
        [showColumnChooser]="columnChooser()"
        [allowExcelExport]="excelExport() || csvExport()"
        [enablePersistence]="enablePersistence()"
        [frozenColumns]="adaptiveFrozenColumns()"
        [toolbar]="toolbar()"
        [height]="height()"
        [rowHeight]="rowHeight()!"
        [gridLines]="options().gridLines ?? 'Horizontal'"
        [editSettings]="options().editSettings!"
        [aggregates]="aggregateRows()"
        (toolbarClick)="onToolbarClick($event)"
        (rowSelected)="rowSelected.emit($event)"
        (rowDataBound)="rowDataBound.emit($event)"
        (actionComplete)="actionComplete.emit($event)"
        (dataStateChange)="onDataStateChange($event)"
      >
        <e-columns>
          @for (col of columns(); track col.field || col.headerText) {
            @let tpl = templateFor(col);
            <e-column
              [field]="col.field!"
              [headerText]="col.headerText"
              [width]="col.width ?? 'auto'"
              [minWidth]="col.minWidth ?? 60"
              [textAlign]="col.textAlign ?? 'Left'"
              [format]="col.format!"
              [type]="col.type!"
              [visible]="col.visible ?? true"
              [allowFiltering]="col.allowFiltering ?? true"
              [allowSorting]="col.allowSorting ?? true"
              [allowGrouping]="col.allowGrouping ?? true"
              [allowEditing]="col.allowEditing ?? true"
              [isPrimaryKey]="col.isPrimaryKey ?? false"
              [displayAsCheckBox]="col.displayAsCheckBox ?? false"
            >
              @if (tpl) {
                <ng-template #template let-rowData>
                  <ng-container *ngTemplateOutlet="tpl; context: { $implicit: rowData }"></ng-container>
                </ng-template>
              } @else if (col.cellType === 'person') {
                <ng-template #template let-rowData>
                  @let pName = rowData[col.field!] || '';
                  @if (pName && pName !== 'ยังไม่ระบุ' && pName !== '—') {
                    <app-person-avatar
                      [personId]="rowData[col.personIdField || 'personId'] || ''"
                      [name]="pName"
                      [showName]="true"
                      size="xs"
                    />
                  } @else {
                    <span class="sf-grid-muted">{{ pName || 'ยังไม่ระบุ' }}</span>
                  }
                </ng-template>
              } @else if (col.cellType === 'badge') {
                <ng-template #template let-rowData>
                  <app-status-badge
                    [label]="String(rowData[col.field!] ?? '—')"
                    [tone]="resolveCellBadgeTone(col, rowData[col.field!])"
                  />
                </ng-template>
              } @else if (col.cellType === 'ticket-link') {
                <ng-template #template let-rowData>
                  @if (rowData[col.field!]) {
                    <button
                      ejs-button
                      cssClass="e-link e-small sf-grid-ticket-btn"
                      type="button"
                      (click)="cellAction.emit({ column: col, row: rowData })"
                    >
                      {{ rowData[col.field!] }}
                    </button>
                  } @else {
                    <span class="sf-grid-muted">—</span>
                  }
                </ng-template>
              } @else if (col.cellType === 'progress') {
                <ng-template #template let-rowData>
                  @if (isFiniteNum(rowData[col.field!])) {
                    <div class="sf-grid-progress">
                      <span class="sf-grid-progress__val" [style.color]="progressBandColor(rowData[col.field!])">{{ formatMetric(rowData[col.field!], col.format) }}{{ col.suffix ?? '' }}</span>
                      <span class="sf-grid-progress__track">
                        <span
                          class="sf-grid-progress__fill"
                          [style.width.%]="clampPct(rowData[col.field!])"
                          [style.background]="progressBandGradient(rowData[col.field!])"
                        ></span>
                      </span>
                    </div>
                  } @else {
                    <span class="sf-grid-muted">—</span>
                  }
                </ng-template>
              } @else if (col.cellType === 'score') {
                <ng-template #template let-rowData>
                  @if (isFiniteNum(rowData[col.field!])) {
                    <span class="sf-grid-score" [attr.data-band]="scoreBand(rowData[col.field!])">
                      {{ formatMetric(rowData[col.field!], col.format) }}{{ col.suffix ?? '' }}
                    </span>
                  } @else {
                    <span class="sf-grid-muted">—</span>
                  }
                </ng-template>
              } @else if (col.cellType === 'metric') {
                <ng-template #template let-rowData>
                  @if (isFiniteNum(rowData[col.field!])) {
                    <span class="tabular-nums font-semibold">{{ formatMetric(rowData[col.field!], col.format) }}{{ col.suffix ?? '' }}</span>
                  } @else {
                    <span class="sf-grid-muted">—</span>
                  }
                </ng-template>
              } @else if (col.cellType === 'date') {
                <ng-template #template let-rowData>
                  <span class="sf-grid-date">{{ formatDateVal(rowData[col.field!], false) }}</span>
                </ng-template>
              } @else if (col.cellType === 'datetime') {
                <ng-template #template let-rowData>
                  <span class="sf-grid-date">{{ formatDateVal(rowData[col.field!], true) }}</span>
                </ng-template>
              } @else if (col.cellType === 'code') {
                <ng-template #template let-rowData>
                  @let codeVal = rowData[col.field!];
                  @let href = col.linkField ? rowData[col.linkField] : null;
                  @if (codeVal) {
                    @if (href) {
                      <a class="sf-grid-code sf-grid-code--link" [href]="href" target="_blank" rel="noopener noreferrer" [title]="String(codeVal)">
                        {{ codeVal }}
                      </a>
                    } @else {
                      <span class="sf-grid-code" [title]="String(codeVal)">{{ codeVal }}</span>
                    }
                  } @else {
                    <span class="sf-grid-muted">—</span>
                  }
                </ng-template>
              } @else if (col.cellType === 'link') {
                <ng-template #template let-rowData>
                  @let rawUrl = safeHttpUrl(rowData[col.linkField || col.field!]);
                  @if (rawUrl) {
                    <a class="sf-grid-ext-link" [href]="rawUrl" target="_blank" rel="noopener noreferrer" [title]="rawUrl">
                      <span class="e-icons e-link" aria-hidden="true"></span>
                      <span>{{ col.linkLabel || 'เปิดลิงก์' }}</span>
                    </a>
                  } @else {
                    <span class="sf-grid-muted">{{ rowData[col.field!] && !String(rowData[col.field!]).startsWith('http') ? rowData[col.field!] : '—' }}</span>
                  }
                </ng-template>
              } @else if (col.cellType === 'boolean') {
                <ng-template #template let-rowData>
                  @let isTrue = Boolean(rowData[col.field!]);
                  <span class="sf-grid-bool" [class.is-true]="isTrue" [class.is-false]="!isTrue">
                    <span class="e-icons" [class.e-check]="isTrue" [class.e-close]="!isTrue" aria-hidden="true"></span>
                    <span>{{ isTrue ? (col.trueLabel ?? 'ผ่าน') : (col.falseLabel ?? 'ไม่ผ่าน') }}</span>
                  </span>
                </ng-template>
              } @else if (col.cellType === 'delta') {
                <ng-template #template let-rowData>
                  @if (isFiniteNum(rowData[col.field!])) {
                    @let d = Number(rowData[col.field!]);
                    <span class="sf-grid-delta" [class.is-pos]="d > 0" [class.is-neg]="d < 0">
                      {{ d > 0 ? '+' : '' }}{{ formatMetric(d, col.format || 'N1') }}{{ col.suffix ?? '' }}
                    </span>
                  } @else {
                    <span class="sf-grid-muted">—</span>
                  }
                </ng-template>
              } @else if (col.cellType === 'title-sub') {
                <ng-template #template let-rowData>
                  <div class="sf-grid-title-sub">
                    <span class="sf-grid-title-sub__main" [title]="String(rowData[col.field!] ?? '')">{{ rowData[col.field!] || '—' }}</span>
                    @if (col.subtitleField && rowData[col.subtitleField]) {
                      <span class="sf-grid-title-sub__sub">{{ rowData[col.subtitleField] }}</span>
                    }
                  </div>
                </ng-template>
              }
            </e-column>
          }
        </e-columns>
      </ejs-grid>
    </div>
    </app-motion-wrapper>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .sf-grid-host[data-density='compact'] ::ng-deep .e-grid .e-rowcell,
    .sf-grid-host[data-density='compact'] ::ng-deep .e-grid .e-headercell {
      padding-top: 6px !important;
      padding-bottom: 6px !important;
      font-size: 12.5px;
    }
    .sf-grid-host[data-density='comfortable'] ::ng-deep .e-grid .e-rowcell {
      padding-top: 13px !important;
      padding-bottom: 13px !important;
    }
    .sf-grid-progress {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 84px;
    }
    .sf-grid-progress__val {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      font-size: 12.5px;
      min-width: 36px;
      text-align: right;
    }
    .sf-grid-progress__track {
      flex: 1;
      height: 6px;
      border-radius: 999px;
      background: var(--surface-track, rgba(39, 70, 179, 0.1));
      overflow: hidden;
    }
    .sf-grid-progress__fill {
      display: block;
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #2746b3, #3b60dc);
      transition: width 320ms var(--ease-nordic, cubic-bezier(0.22, 1, 0.36, 1));
    }
    .sf-grid-muted {
      color: var(--ink-3, #94a3b8);
    }
    .sf-grid-ticket-btn {
      background: transparent;
      border: 0;
      padding: 0;
      cursor: pointer;
      font-family: var(--font-mono, ui-monospace, monospace);
      font-weight: 600;
      font-size: 0.8125rem;
      color: var(--primary, #3b60dc);
      text-decoration: none;
    }
    .sf-grid-ticket-btn:hover {
      text-decoration: underline;
    }
    .sf-grid-score {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      padding: 2px 8px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
      border: 1px solid transparent;
    }
    .sf-grid-score[data-band='excellent'] {
      background: rgba(16, 185, 129, 0.14);
      border-color: rgba(16, 185, 129, 0.3);
      color: #059669;
    }
    .sf-grid-score[data-band='good'] {
      background: rgba(14, 165, 233, 0.14);
      border-color: rgba(14, 165, 233, 0.3);
      color: #0284c7;
    }
    .sf-grid-score[data-band='warn'] {
      background: rgba(245, 158, 11, 0.14);
      border-color: rgba(245, 158, 11, 0.3);
      color: #d97706;
    }
    .sf-grid-score[data-band='bad'] {
      background: rgba(244, 63, 94, 0.14);
      border-color: rgba(244, 63, 94, 0.3);
      color: #e11d48;
    }
    :host-context(.e-dark-mode) .sf-grid-score[data-band='excellent'] { color: #34d399; }
    :host-context(.e-dark-mode) .sf-grid-score[data-band='good'] { color: #38bdf8; }
    :host-context(.e-dark-mode) .sf-grid-score[data-band='warn'] { color: #fbbf24; }
    :host-context(.e-dark-mode) .sf-grid-score[data-band='bad'] { color: #fb7185; }
    .sf-grid-date {
      font-size: 0.8125rem;
      font-variant-numeric: tabular-nums;
      color: var(--ink-2, #64748b);
      white-space: nowrap;
    }
    .sf-grid-code {
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 2px 6px;
      border-radius: 6px;
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 0.75rem;
      background: rgba(148, 163, 184, 0.14);
      color: var(--ink-1, #0f172a);
      text-decoration: none;
    }
    :host-context(.e-dark-mode) .sf-grid-code {
      background: rgba(148, 163, 184, 0.16);
      color: #e2e8f0;
    }
    .sf-grid-code--link {
      color: var(--primary, #3b60dc);
    }
    .sf-grid-code--link:hover {
      text-decoration: underline;
    }
    .sf-grid-ext-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--primary, #3b60dc);
      text-decoration: none;
    }
    .sf-grid-ext-link:hover {
      text-decoration: underline;
    }
    .sf-grid-bool {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .sf-grid-bool.is-true {
      background: rgba(16, 185, 129, 0.14);
      color: #059669;
    }
    .sf-grid-bool.is-false {
      background: rgba(148, 163, 184, 0.14);
      color: var(--ink-3, #64748b);
    }
    :host-context(.e-dark-mode) .sf-grid-bool.is-true { color: #34d399; }
    .sf-grid-delta {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--ink-2, #64748b);
    }
    .sf-grid-delta.is-pos { color: #059669; }
    .sf-grid-delta.is-neg { color: #e11d48; }
    :host-context(.e-dark-mode) .sf-grid-delta.is-pos { color: #34d399; }
    :host-context(.e-dark-mode) .sf-grid-delta.is-neg { color: #fb7185; }
    .sf-grid-title-sub {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }
    .sf-grid-title-sub__main {
      font-weight: 600;
      color: var(--ink-1, #0f172a);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    :host-context(.e-dark-mode) .sf-grid-title-sub__main { color: #f1f5f9; }
    .sf-grid-title-sub__sub {
      font-size: 0.75rem;
      color: var(--ink-3, #64748b);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class SfGridComponent {
  protected readonly viewport = inject(ViewportService);
  private readonly autoId = `sf-grid-${nextGridId++}`;

  @ViewChild('gridRef') private gridRef?: GridComponent;

  readonly data = input<object[] | SfGridRemoteData<object>>([]);
  readonly columns = input<readonly SfGridColumn[]>([]);
  readonly cellTemplates = input<Record<string, TemplateRef<{ $implicit: any }>>>({});
  readonly aggregates = input<readonly SfGridAggregate[]>([]);
  readonly options = input<SfGridOptions>({});

  readonly rowSelected = output<RowSelectEventArgs>();
  readonly rowDataBound = output<RowDataBoundEventArgs>();
  readonly toolbarAction = output<ClickEventArgs>();
  readonly actionComplete = output<any>();
  readonly cellAction = output<{ column: SfGridColumn; row: any }>();
  /** Syncfusion custom remote binding — ยิงเมื่อ paging/sorting/filtering/search */
  readonly dataStateChange = output<DataStateChangeEventArgs>();

  protected readonly String = String;
  protected readonly Boolean = Boolean;
  protected readonly Number = Number;

  protected readonly remoteEnabled = computed(() => !!this.options().remote);

  protected readonly gridDataSource = computed(() => {
    const raw = this.data();
    if (raw && !Array.isArray(raw) && Array.isArray((raw as SfGridRemoteData).result)) {
      return raw;
    }
    return Array.isArray(raw) ? raw : [];
  });

  private readonly defaultBadgeTones: Record<string, BadgeTone> = {
    ว่าง: 'success',
    พร้อม: 'success',
    ผ่าน: 'success',
    PASS: 'success',
    Done: 'success',
    เต็ม: 'danger',
    เกินเป้า: 'danger',
    FAIL: 'danger',
    Reopened: 'danger',
    Blocked: 'danger',
    blocked: 'danger',
    สูงมาก: 'danger',
    สูง: 'coral',
    ปานกลาง: 'warning',
    ต่ำ: 'success',
    WARN: 'warning',
    'In Progress': 'primary',
    'Code Review': 'violet',
    'Ready for QA': 'coral',
    'In QA': 'info',
    Backlog: 'secondary',
    IMP: 'primary',
    Implement: 'primary',
    RND: 'teal',
    RD: 'teal',
    'R&D': 'teal',
    'R&D (FE / BE / AI)': 'teal',
    QA: 'info',
    'QA / Tester': 'info',
    UXBA: 'violet',
    'Product / BA / UX': 'violet',
    SUP: 'warning',
    'Support / Helpdesk': 'warning',
    INFRA: 'coral',
    'Infra / DevOps / Sec': 'coral',
    Feature: 'primary',
    CR: 'indigo',
    Spike: 'violet',
    Ops: 'coral',
    TechDebt: 'warning',
    'Bug-Fix': 'danger',
    'Bug-Investigate': 'danger',
    Senior: 'violet',
    Mid: 'teal',
    Junior: 'info',
    FirstMonth: 'warning',
    เดือนแรก: 'warning',
    อนุมัติแล้ว: 'success',
    APPROVED: 'success',
    ปฏิเสธ: 'danger',
    REJECTED: 'danger',
    รอพิจารณา: 'warning',
    PENDING: 'warning',
    passed: 'success',
    success: 'success',
    failed: 'danger',
    error: 'danger',
    running: 'info',
    partial: 'warning',
    ในแผน: 'success',
    นอกแผน: 'warning',
    ตรงสัปดาห์: 'success',
    ปกติ: 'success',
    'สมบูรณ์ 100%': 'success',
    หลักฐานไม่ครบ: 'warning',
    'เกิน SLA': 'danger',
    admin: 'violet',
    Admin: 'violet',
    lead: 'teal',
    Lead: 'teal',
    member: 'info',
    Member: 'info',
    XS: 'secondary',
    S: 'info',
    M: 'primary',
    L: 'warning',
    XL: 'coral',
    Urgent: 'danger',
    High: 'coral',
    Medium: 'warning',
    Low: 'secondary',
  };

  protected progressBandColor(value: unknown): string {
    const pct = this.clampPct(value);
    if (pct >= 85) return 'var(--emerald, #059669)';
    if (pct >= 75) return 'var(--teal, #0d9488)';
    if (pct >= 60) return 'var(--amber, #d97706)';
    return 'var(--rose, #e11d48)';
  }

  protected progressBandGradient(value: unknown): string {
    const pct = this.clampPct(value);
    if (pct >= 85) return 'linear-gradient(90deg, #059669, #10b981)';
    if (pct >= 75) return 'linear-gradient(90deg, #0d9488, #14b8a6)';
    if (pct >= 60) return 'linear-gradient(90deg, #d97706, #f59e0b)';
    return 'linear-gradient(90deg, #e11d48, #fb7185)';
  }

  protected resolveCellBadgeTone(col: SfGridColumn, value: unknown): BadgeTone {
    if (col.badgeTone) return col.badgeTone;
    const key = String(value ?? '');
    if (col.toneMap && key in col.toneMap) return col.toneMap[key]!;
    if (key in this.defaultBadgeTones) return this.defaultBadgeTones[key]!;
    return 'secondary';
  }

  protected formatMetric(value: unknown, format?: string): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    if (format === 'N1') return n.toFixed(1);
    if (format === 'N2') return n.toFixed(2);
    if (format === 'N0') return Math.round(n).toString();
    return String(value);
  }

  protected isFiniteNum(value: unknown): boolean {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  protected scoreBand(value: unknown): 'excellent' | 'good' | 'warn' | 'bad' {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'warn';
    if (n >= 85) return 'excellent';
    if (n >= 75) return 'good';
    if (n >= 60) return 'warn';
    return 'bad';
  }

  protected formatDateVal(value: unknown, withTime: boolean): string {
    if (value === null || value === undefined || value === '') return '—';
    const normalized = value instanceof Date ? value.toISOString() : String(value);
    return withTime ? formatDateTime(normalized) : formatDateOnly(normalized);
  }

  protected safeHttpUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  }

  protected clampPct(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  protected readonly textWrapSettings: TextWrapSettingsModel = { wrapMode: 'Content' };

  protected readonly gridId = computed(() => this.options().id || this.autoId);
  protected readonly motionRefreshKey = computed(() => {
    const raw = this.data();
    const rows = Array.isArray(raw)
      ? raw
      : ((raw as SfGridRemoteData | undefined)?.result ?? []);
    const first = rows[0] as Record<string, unknown> | undefined;
    const headKey = first ? String(first['id'] ?? first['code'] ?? first['personId'] ?? '') : '';
    const total =
      !Array.isArray(raw) && raw && 'count' in raw ? Number((raw as SfGridRemoteData).count) : rows.length;
    return `${total}:${rows.length}:${headKey}`;
  });
  protected readonly paging = computed(() => this.options().paging ?? true);
  protected readonly sorting = computed(() => this.options().sorting ?? true);
  protected readonly grouping = computed(() => this.options().grouping ?? false);
  protected readonly resizable = computed(() => this.options().resizable ?? true);
  protected readonly reorderable = computed(() => this.options().reorderable ?? false);
  protected readonly allowTextWrap = computed(() => this.options().allowTextWrap ?? false);
  protected readonly columnChooser = computed(() => this.options().columnChooser ?? false);
  protected readonly excelExport = computed(() => this.options().excelExport ?? false);
  protected readonly csvExport = computed(() => this.options().csvExport ?? false);
  protected readonly enablePersistence = computed(() => this.options().enablePersistence ?? false);
  protected readonly height = computed(() => this.options().height ?? 'auto');
  protected readonly density = computed(() => this.options().density ?? 'default');
  protected readonly rowHeight = computed(() => this.options().rowHeight);

  protected readonly aggregateRows = computed<AggregateRowModel[]>(() => {
    const list = this.aggregates();
    if (list.length === 0) return [];
    return [
      {
        columns: list.map((agg) => ({
          field: agg.field,
          type: agg.type,
          format: agg.format,
          footerTemplate: `${agg.prefix ?? ''}\${${agg.type}}${agg.suffix ?? ''}`,
        })),
      },
    ];
  });

  protected readonly pageSettings = computed<PageSettingsModel>(() => ({
    pageSize: this.options().pageSize ?? 12,
    pageSizes: this.options().pageSizes ?? false,
  }));

  protected readonly sortSettings = computed<SortSettingsModel>(
    () => this.options().sortSettings ?? {},
  );

  protected readonly filteringEnabled = computed(() => Boolean(this.options().filtering));
  protected readonly filterSettings = computed<FilterSettingsModel>(() => {
    const f = this.options().filtering;
    const type: FilterType = typeof f === 'string' ? f : 'Menu';
    return { type };
  });

  protected readonly groupSettings = computed<GroupSettingsModel>(() => ({
    columns: this.options().groupColumns ?? [],
    showDropArea: this.grouping(),
  }));

  protected readonly adaptiveFrozenColumns = computed(() => {
    const colFrozenCount = this.columns().filter((c) => c.isFrozen).length;
    const requested = this.options().autoFreezeDesktop ?? colFrozenCount;
    if (!requested) return 0;
    if (this.viewport.isMobile()) return 0;
    if (this.viewport.isTablet()) return Math.min(1, requested);
    return requested;
  });

  protected readonly toolbar = computed<(ToolbarItems | string | object)[] | undefined>(() => {
    const items: (ToolbarItems | string | object)[] = [];
    if (this.options().search) items.push('Search');
    if (this.columnChooser()) items.push('ColumnChooser');
    if (this.excelExport()) items.push('ExcelExport');
    if (this.csvExport()) items.push('CsvExport');
    if (this.options().extraToolbar?.length) {
      items.push(...this.options().extraToolbar!);
    }
    return items.length ? items : undefined;
  });

  protected templateFor(col: SfGridColumn): TemplateRef<{ $implicit: any }> | null {
    const key = col.templateKey ?? col.field;
    if (!key) return null;
    return this.cellTemplates()[key] ?? null;
  }

  protected resolveColFrozen(col: SfGridColumn): boolean {
    if (!col.isFrozen) return false;
    return !this.viewport.isMobile();
  }

  protected onToolbarClick(args: ClickEventArgs): void {
    const itemId = args.item?.id ?? '';
    const fileName = this.options().exportFileName || this.gridId();
    if (itemId.endsWith('_excelexport')) {
      this.exportExcel(`${fileName}.xlsx`);
      return;
    }
    if (itemId.endsWith('_csvexport')) {
      this.exportCsv(`${fileName}.csv`);
      return;
    }
    this.toolbarAction.emit(args);
  }

  protected onDataStateChange(args: DataStateChangeEventArgs): void {
    if (!this.remoteEnabled()) {
      return;
    }
    this.dataStateChange.emit(args);
  }

  exportExcel(fileName?: string): void {
    this.gridRef?.excelExport({ fileName: fileName || `${this.gridId()}.xlsx` });
  }

  exportCsv(fileName?: string): void {
    this.gridRef?.csvExport({ fileName: fileName || `${this.gridId()}.csv` });
  }

  refresh(): void {
    this.gridRef?.refresh();
  }

  instance(): GridComponent | undefined {
    return this.gridRef;
  }
}

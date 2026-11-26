import { ChangeDetectionStrategy, Component, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import type { DataStateChangeEventArgs } from '@syncfusion/ej2-angular-grids';
import { currentViewer, effectiveRole, openprojectTypeCatalog } from '../../core/admin-settings';
import {
  ApiClient,
  ListQueryParams,
  listQueryFromGridState,
} from '../../core/api-client';
import { scorePartNotes } from '../../core/kpi-meaning';
import { MyProjectSyncAdapter } from '../../core/myproject-sync';
import { ScorecardService, TicketRow } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { BugCause, PocResult, Size, Ticket, TicketType, Track, VarianceCode, WorkflowStatus, normalizeTrack } from '../../core/models';
import { SIZE_POINTS, SIZE_STANDARD_MD, scoreTicket } from '../../core/scoring';
import { parseClosedTicketCsv, parseClosedTicketJson } from '../../core/ticket-file';
import { ShellNotice } from '../../core/shell-notice';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { ViewportService } from '../../core/viewport.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import { REFERENCE_BUG_ID, REFERENCE_SPIKE_ID } from '../../data/seed';
import {
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  SfAccordionComponent,
  SfAccordionItem,
  SfCheckboxComponent,
  SfChipListComponent,
  SfDatePickerComponent,
  SfDialogComponent,
  SfDropdownComponent,
  FilterChipOption,
  FilterChipsComponent,
  SfGridAggregate,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  SfGridRemoteData,
  listGridOptions,
  SfMessageComponent,
  SfNumberComponent,
  SfTextBoxComponent,
  SfToolbarComponent,
  SfUploaderComponent,
  StatusBadgeComponent,
  blockerToneMap,
  closedToneMap,
  dodToneMap,
  toneForAlertLabel,
  toneForTicketType,
  trackToneMap,
  unplannedYesNoToneMap,
  weekToneMap,
  workflowStatusToneMap,
  type BadgeTone,
} from '../../shared/ui';
import type { WorkspaceTrackFilter } from '../../../../shared/domain/workspace-scope';
import { listWorkspaceTrackChipOptions, parseWorkspaceTrackFilter } from '../../../../shared/domain/workspace-scope';

/** ฟิลด์เรียงที่ API รองรับบน Ticket ดิบ (คะแนนคำนวณฝั่ง client หลังโหลดหน้า) */
const TICKET_REMOTE_SORT_FIELDS = new Set([
  'id',
  'module',
  'estimateMd',
  'actualMd',
  'reviewRounds',
  'reopenCount',
  'assigneeId',
  'workflowStatus',
  'closedOn',
  'track',
  'size',
  'type',
]);

type TrackFilter = WorkspaceTrackFilter;
type TypeFilter = string;

@Component({
  selector: 'app-tickets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonModule,
    PersonAvatarComponent,
    PageHeadComponent,
    StatusBadgeComponent,
    SectionCardComponent,
    SfAccordionComponent,
    SfCheckboxComponent,
    SfChipListComponent,
    SfDatePickerComponent,
    SfDialogComponent,
    SfDropdownComponent,
    FilterChipsComponent,
    SfGridComponent,
    SfMessageComponent,
    SfNumberComponent,
    SfTextBoxComponent,
    SfToolbarComponent,
    SfUploaderComponent,
  ],
  templateUrl: './tickets.html',
})
export class TicketsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient, { optional: true });
  private readonly myProject = inject(MyProjectSyncAdapter);
  private readonly notice = inject(ShellNotice);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly workspace = inject(WorkspaceFilter);
  protected readonly viewport = inject(ViewportService);

  @ViewChild('selfUpdateDialog') private selfUpdateDialog?: SfDialogComponent;

  protected readonly isMine = computed(
    () => this.route.snapshot.data['scope'] === 'mine' || effectiveRole() === 'member',
  );
  protected readonly role = effectiveRole;
  protected readonly activePersonId = computed(
    () => currentSession()?.person.id ?? currentViewer().id,
  );
  protected readonly activePerson = computed(
    () => this.scorecard.roster().find((p) => p.id === this.activePersonId()) ?? null,
  );

  protected readonly accordionItems = computed<SfAccordionItem[]>(() =>
    this.isMine()
      ? [{ id: 'rubric', header: 'เกณฑ์การให้คะแนน 100 คะแนน และตารางขนาดมาตรฐาน (XS–XL)', expanded: false }]
      : [
          { id: 'import', header: 'นำเข้าไฟล์ CSV/JSON และซิงก์ myProject', expanded: false },
          { id: 'add', header: 'เพิ่มใบงานใหม่ / จำลองคำนวณคะแนนใบงาน', expanded: false },
          { id: 'rubric', header: 'เกณฑ์การให้คะแนน 100 คะแนน และตารางขนาดมาตรฐาน (XS–XL)', expanded: false },
        ],
  );

  protected readonly ticketColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'รหัส', width: 120 },
    { field: 'workflowStatus', headerText: 'สถานะงาน', width: 140 },
    { field: 'manage', headerText: 'จัดการใบงาน', width: 215, allowFiltering: false, allowSorting: false },
    { field: 'trackLabel', headerText: 'สาย', width: 110 },
    { field: 'displayType', headerText: 'ชนิด', width: 155 },
    { field: 'module', headerText: 'โมดูล', width: 120 },
    { field: 'size', headerText: 'ขนาด', width: 80 },
    { field: 'points', headerText: 'Points', width: 90, textAlign: 'Right' },
    { field: 'assignee', headerText: 'ผู้รับ', width: 185 },
    { field: 'estimateMd', headerText: 'Est', width: 95, textAlign: 'Right', format: 'N2' },
    { field: 'actualMd', headerText: 'Actual', width: 95, textAlign: 'Right', format: 'N2' },
    { field: 'ratioLabel', headerText: 'อัตราส่วน', width: 110 },
    { field: 'weekOffsetLabel', headerText: 'สัปดาห์', width: 120 },
    { field: 'weekPoints', headerText: 'คะแนนสัปดาห์', width: 130, textAlign: 'Right', visible: false },
    { field: 'accuracyPoints', headerText: 'คะแนนแม่น', width: 120, textAlign: 'Right', visible: false },
    { field: 'reviewRounds', headerText: 'รอบรีวิว', width: 110, textAlign: 'Right', visible: false },
    { field: 'blockerLabel', headerText: 'Blocker', width: 100, visible: false },
    { field: 'reviewPoints', headerText: 'คะแนนรีวิว', width: 120, textAlign: 'Right', visible: false },
    { field: 'reopenCount', headerText: 'Reopen', width: 100, textAlign: 'Right', visible: false },
    { field: 'reopenPoints', headerText: 'คะแนนเปิดซ้ำ', width: 130, textAlign: 'Right', visible: false },
    { field: 'varianceCode', headerText: 'Variance', width: 110, visible: false },
    { field: 'closedLabel', headerText: 'ปิด', width: 90, visible: false },
    { field: 'dodLabel', headerText: 'DoD', width: 90, visible: false },
    { field: 'spikeLabel', headerText: 'Spike', width: 90, visible: false },
    { field: 'unplannedLabel', headerText: 'นอกแผน', width: 100, visible: false },
    { field: 'score', headerText: 'คะแนน', width: 100, textAlign: 'Right' },
    { field: 'policyDateLabel', headerText: 'Policy Date', width: 135 },
    { field: 'policySlaLabel', headerText: 'Policy SLA', width: 120, visible: false },
    { field: 'receiptDateLabel', headerText: 'Receipt Date', width: 115, visible: false },
    { field: 'alertDateLabel', headerText: 'Alert Date', width: 115, visible: false },
    { field: 'replyDateLabel', headerText: 'Reply Date', width: 115, visible: false },
    { field: 'scoreMeaning', headerText: 'ที่มาของคะแนน', width: 380, visible: false },
    { field: 'alertLabel', headerText: 'แจ้งเตือน', width: 180, visible: false },
    { field: 'closedOnLabel', headerText: 'วันที่ปิด', width: 120 },
    { field: 'note', headerText: 'หมายเหตุ', width: 260, visible: false },
  ];

  protected readonly ticketAggregates: SfGridAggregate[] = [
    { field: 'id', type: 'Count', prefix: 'รวม ', suffix: ' ใบ' },
    { field: 'estimateMd', type: 'Sum', format: 'N2', prefix: 'รวม ', suffix: ' MD' },
    { field: 'actualMd', type: 'Sum', format: 'N2', prefix: 'รวม ', suffix: ' MD' },
    { field: 'score', type: 'Average', format: 'N1', prefix: 'เฉลี่ย ' },
  ];

  protected readonly groupBy = signal<'none' | 'track' | 'assignee' | 'project'>('none');
  protected readonly groupByChips: FilterChipOption[] = [
    { id: 'none', label: 'ไม่จัดกลุ่ม' },
    { id: 'track', label: 'ตามสาย' },
    { id: 'assignee', label: 'ตามผู้รับ' },
    { id: 'project', label: 'ตามโมดูล' },
  ];

  protected readonly ticketGridOptions = computed<SfGridOptions>(() => {
    const groupBy = this.useRemote() ? 'none' : this.groupBy();
    const groupField =
      groupBy === 'track' ? 'trackLabel' : groupBy === 'assignee' ? 'assignee' : groupBy === 'project' ? 'module' : '';
    return listGridOptions({
      id: this.isMine()
        ? this.useRemote()
          ? 'my-tickets-score-grid-v8-remote'
          : 'my-tickets-score-grid-v8'
        : this.useRemote()
          ? 'tickets-score-grid-v8-remote'
          : 'tickets-score-grid-v8',
      enablePersistence: true,
      pageSize: 10,
      search: false,
      sortSettings: {
        columns: [
          {
            field: this.useRemote() ? 'id' : 'score',
            direction: this.useRemote() ? 'Ascending' : 'Descending',
          },
        ],
      },
      filtering: 'Excel',
      columnChooser: true,
      excelExport: true,
      csvExport: true,
      autoFreezeDesktop: 2,
      exportFileName: this.isMine() ? 'my-tickets-scorecard' : 'team-tickets-scorecard',
      remote: this.useRemote(),
      grouping: Boolean(groupField),
      groupColumns: groupField ? [groupField] : [],
    });
  });

  protected setGroupBy(id: string): void {
    if (id === 'track' || id === 'assignee' || id === 'project' || id === 'none') {
      this.groupBy.set(id);
    }
  }
  protected readonly trackToneMap = trackToneMap;
  protected readonly blockerToneMap = blockerToneMap;
  protected readonly closedToneMap = closedToneMap;
  protected readonly dodToneMap = dodToneMap;
  protected readonly unplannedYesNoToneMap = unplannedYesNoToneMap;
  protected readonly weekToneMap = weekToneMap;
  protected readonly workflowStatusToneMap = workflowStatusToneMap;
  protected readonly sizes = (['XS', 'S', 'M', 'L', 'XL'] as const).map((size) => ({
    size,
    points: SIZE_POINTS[size],
    md: SIZE_STANDARD_MD[size],
  }));
  protected readonly sizeChips = this.sizes.map((item) => `${item.size} ${item.points} points / ${item.md} MD`);
  protected readonly scoreMeaningCards = [
    '40 มาจากส่งตรงสัปดาห์ — ความน่าเชื่อถือของแผน ไม่ใช่ความเร็ว',
    '20 มาจากอัตราส่วน 0.8–1.5 — การตีขนาดเก่งขึ้น เทียบกับตัวเอง',
    '20 มาจากรีวิวไม่เกิน 2 รอบและไม่มี blocker — ยังไม่พังเรื่อง security หรือ boundary',
    '20 มาจากไม่ reopen — ของที่ส่งแล้วอยู่ได้หลัง DEV/UAT',
  ];
  protected readonly trackOptions = listWorkspaceTrackChipOptions()
    .filter((row) => row.id !== 'All')
    .map((row) => ({ text: row.label, value: row.id }));
  protected readonly trackFilters = computed(() =>
    listWorkspaceTrackChipOptions(this.scorecard.people(), this.scorecard.tickets()).map((row) => ({
      text: row.id === 'All' ? 'ทุกสาย' : row.label,
      value: row.id,
    })),
  );
  protected readonly typeOptions = [
    { text: 'Feature', value: 'Feature' },
    { text: 'CR', value: 'CR' },
    { text: 'Bug-Investigate', value: 'Bug-Investigate' },
    { text: 'Bug-Fix', value: 'Bug-Fix' },
    { text: 'Spike', value: 'Spike' },
    { text: 'Ops', value: 'Ops' },
    { text: 'TechDebt', value: 'TechDebt' },
  ];
  protected readonly typeFilters = computed(() => {
    const seen = new Set<string>();
    for (const entry of openprojectTypeCatalog()) {
      const name = entry.name?.trim();
      if (name) seen.add(name);
    }
    for (const row of this.scorecard.ticketRows()) {
      if (row.displayType) seen.add(row.displayType);
    }
    if (seen.size === 0) {
      for (const opt of this.typeOptions) seen.add(opt.value);
    }
    return [
      { text: 'ทุกชนิด', value: 'All' },
      ...[...seen]
        .sort((a, b) => a.localeCompare(b, 'th'))
        .map((name) => ({ text: name, value: name })),
    ];
  });
  protected readonly sizeOptions = this.sizes.map((item) => ({
    text: `${item.size} · ${item.points} points · ${item.md} MD`,
    value: item.size,
  }));
  protected readonly weekOptions = [
    { text: 'ตรงสัปดาห์ (0)', value: '0' },
    { text: 'เลื่อน 1 สัปดาห์', value: '1' },
    { text: 'เลื่อน 2 สัปดาห์ขึ้นไป', value: '2' },
  ];
  protected readonly varianceOptions = [
    { text: 'NONE', value: 'NONE' },
    { text: 'REQ', value: 'REQ' },
    { text: 'BLK', value: 'BLK' },
    { text: 'ENV', value: 'ENV' },
    { text: 'LEG', value: 'LEG' },
  ];
  protected readonly yesNoOptions = [
    { text: 'ใช่', value: 'yes' },
    { text: 'ไม่', value: 'no' },
  ];
  protected readonly assigneeOptions = computed(() =>
    this.scorecard.people().map((person) => ({
      text: `${person.nickname} · ${person.role}`,
      value: person.id,
    })),
  );

  protected readonly referenceBug = REFERENCE_BUG_ID;
  protected readonly referenceSpike = REFERENCE_SPIKE_ID;
  protected readonly trackFilter = signal<TrackFilter>('All');
  protected readonly typeFilter = signal<TypeFilter>('All');
  protected readonly query = signal('');
  protected readonly message = signal('');
  protected readonly error = signal('');

  /** Remote page state (เมื่อ API ออนไลน์) */
  private readonly remotePage = signal(1);
  private readonly remotePageSize = signal(10);
  private readonly remoteSort = signal('id');
  private readonly remoteDir = signal<'asc' | 'desc'>('asc');
  private readonly remoteRows = signal<TicketRow[]>([]);
  private readonly remoteTotal = signal(0);
  private readonly remoteClosedCount = signal(0);
  private readonly remoteOpenCount = signal(0);
  private remoteLoadSeq = 0;

  protected readonly useRemote = computed(
    () => Boolean(this.api) && this.scorecard.usingApi() && !this.scorecard.mockMode(),
  );

  private readonly syncWorkspaceTrack = effect(() => {
    const track = this.isMine() ? 'All' : this.workspace.track();
    if (this.trackFilter() !== track) {
      this.trackFilter.set(track);
    }
    const wsType = this.workspace.opType() || 'All';
    if (this.typeFilter() !== wsType) {
      this.typeFilter.set(wsType);
    }
  });

  private readonly reloadRemote = effect(() => {
    if (!this.useRemote()) return;
    // อ่านสัญญาณตัวกรองเพื่อให้ effect รีโหลดเมื่อเปลี่ยน
    this.trackFilter();
    this.typeFilter();
    this.query();
    this.workspace.teamId();
    this.workspace.personId();
    this.workspace.statusScope();
    this.workspace.opProject();
    this.isMine();
    this.activePersonId();
    this.remotePage();
    this.remotePageSize();
    this.remoteSort();
    this.remoteDir();
    void this.loadRemoteTickets();
  });

  protected readonly track = signal<Track>('Implement');
  protected readonly type = signal<TicketType>('Bug-Fix');
  protected readonly moduleName = signal('');
  protected readonly size = signal<Size>('S');
  protected readonly estimateMd = signal<number | null>(0.5);
  protected readonly actualMd = signal<number | null>(0.75);
  protected readonly weekOffset = signal('0');
  protected readonly reviewRounds = signal<number | null>(1);
  protected readonly blocker = signal('no');
  protected readonly reopenCount = signal<number | null>(0);
  protected readonly variance = signal<VarianceCode>('LEG');
  protected readonly closed = signal('yes');
  protected readonly dodPassed = signal('no');
  protected readonly inTimeBox = signal('yes');
  protected readonly childTicketsSized = signal('yes');
  protected readonly unplanned = signal('no');
  protected readonly assigneeId = signal('itsara');
  protected readonly closedOn = signal<Date | null>(new Date(2025, 9, 31));

  protected readonly alerts = this.scorecard.alerts;

  // Self-Service Ticket Update Dialog state
  protected readonly editingTicketId = signal<string | null>(null);
  protected readonly editWorkflowStatus = signal<WorkflowStatus>('In Progress');
  protected readonly editActualMd = signal<number | null>(0);
  protected readonly editMrLink = signal('');
  protected readonly editPocResult = signal<string>('');
  protected readonly editBugCause = signal<string>('');
  protected readonly editIsPaused = signal(false);
  protected readonly editPausedDays = signal<number | null>(0);
  protected readonly editUnitTestDone = signal(false);
  protected readonly editMrAttached = signal(false);
  protected readonly editNote = signal('');

  protected readonly pocResultOptions = computed<{ text: string; value: string }[]>(() => {
    const base: { text: string; value: string }[] = [
      { text: '— ไม่ระบุ —', value: '' },
      { text: 'Adopted (นำไปใช้จริง)', value: 'Adopted' },
      { text: 'Alternative Chosen (ใช้ทางเลือกอื่น)', value: 'Alternative Chosen' },
      { text: 'Dropped (ยุติแนวทางนี้)', value: 'Dropped' },
    ];
    const seen = new Set(base.map((b) => b.value));
    for (const t of this.scorecard.tickets()) {
      const val = (t.pocResult ?? '').trim();
      if (val && !seen.has(val)) {
        seen.add(val);
        base.push({ text: val, value: val });
      }
    }
    return base;
  });

  protected readonly bugCauseOptions = computed<{ text: string; value: string }[]>(() => {
    const base: { text: string; value: string }[] = [
      { text: '— ไม่ระบุ —', value: '' },
      { text: 'Logic (ตรรกะโค้ด)', value: 'Logic' },
      { text: 'UI (หน้าจอ/การแสดงผล)', value: 'UI' },
      { text: 'API (การเชื่อมต่อ/ข้อมูล)', value: 'API' },
      { text: 'Requirement (โจทย์/สเปกเปลี่ยน)', value: 'Requirement' },
      { text: 'Environment (เซิร์ฟเวอร์/ตั้งค่า)', value: 'Environment' },
    ];
    const seen = new Set(base.map((b) => b.value));
    for (const t of this.scorecard.tickets()) {
      const val = (t.bugCause ?? '').trim();
      if (val && !seen.has(val)) {
        seen.add(val);
        base.push({ text: val, value: val });
      }
    }
    return base;
  });

  protected readonly workflowStatusOptions = computed(() => {
    const base: { text: string; value: WorkflowStatus }[] = [
      { text: 'Backlog (รอเริ่ม)', value: 'Backlog' },
      { text: 'In Progress (กำลังทำ)', value: 'In Progress' },
      { text: 'Code Review (กำลังรีวิวโค้ด)', value: 'Code Review' },
      { text: 'Ready for QA (พร้อมส่งตรวจ)', value: 'Ready for QA' },
      { text: 'In QA (กำลังตรวจ)', value: 'In QA' },
      { text: 'Reopened (เปิดแก้ไขซ้ำ)', value: 'Reopened' },
    ];
    if (!this.isMine() && (this.role() === 'admin' || this.role() === 'lead')) {
      base.push({ text: 'Done (เสร็จสมบูรณ์)', value: 'Done' });
    }
    return base;
  });

  protected readonly localRows = computed(() => {
    const track = this.trackFilter();
    const type = this.typeFilter();
    const query = this.query();
    const selfId = this.activePersonId();
    const scopedIds = new Set(this.workspace.applyToTickets(this.scorecard.tickets()).map((t) => t.id));
    return this.scorecard
      .ticketRows()
      .filter((row) => scopedIds.has(row.id))
      .filter((row) => (!this.isMine() ? true : row.assigneeId === selfId))
      .filter(
        (row) =>
          (track === 'All' || normalizeTrack(row.track) === normalizeTrack(track)) &&
          (type === 'All' || row.displayType === type || row.type === type),
      )
      .filter(
        (row) =>
          query === '' ||
          `${row.id} ${row.module} ${row.displayType} ${row.assignee}`.toLowerCase().includes(query),
      );
  });

  protected readonly remoteGridData = computed<SfGridRemoteData<TicketRow>>(() => ({
    result: this.remoteRows(),
    count: this.remoteTotal(),
  }));

  protected readonly gridData = computed(() =>
    this.useRemote() ? this.remoteGridData() : this.localRows(),
  );

  protected readonly rows = computed(() =>
    this.useRemote() ? this.remoteRows() : this.localRows(),
  );

  protected readonly myTicketStats = computed(() => {
    const list = this.rows();
    const closedRows = list.filter((r) => r.score !== null);
    const openCount = this.useRemote()
      ? this.remoteOpenCount()
      : list.length - closedRows.length;
    const closedCount = this.useRemote() ? this.remoteClosedCount() : closedRows.length;
    const total = this.useRemote() ? this.remoteTotal() : list.length;
    const avgScore =
      closedRows.length > 0
        ? Math.round(
            (closedRows.reduce((sum, r) => sum + (r.score ?? 0), 0) / closedRows.length) * 10,
          ) / 10
        : 0;
    const totalActualMd =
      Math.round(list.reduce((sum, r) => sum + r.actualMd, 0) * 100) / 100;
    return {
      total,
      openCount,
      closedCount,
      avgScore,
      totalActualMd,
    };
  });

  protected onGridDataStateChange(state: DataStateChangeEventArgs): void {
    if (!this.useRemote()) return;
    const mapped = listQueryFromGridState(state);
    if (mapped.page) this.remotePage.set(mapped.page);
    if (mapped.pageSize) this.remotePageSize.set(mapped.pageSize);
    if (mapped.sort && TICKET_REMOTE_SORT_FIELDS.has(mapped.sort)) {
      this.remoteSort.set(mapped.sort);
    } else if (mapped.sort) {
      this.remoteSort.set('id');
    }
    if (mapped.dir) this.remoteDir.set(mapped.dir);
  }

  protected async exportFromServer(): Promise<void> {
    if (!this.api || !this.useRemote()) return;
    try {
      const blob = await this.api.exportWorkItems({
        ...this.buildRemoteQuery(),
        page: undefined,
        pageSize: undefined,
        format: 'csv',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `work-items-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      this.notice.success('ส่งออกใบงานจากเซิร์ฟเวอร์แล้ว');
    } catch (err) {
      this.notice.error(err instanceof Error ? err.message : 'ส่งออกไม่สำเร็จ');
    }
  }

  private buildRemoteQuery(): ListQueryParams {
    const track = this.trackFilter();
    const type = this.typeFilter();
    const selfId = this.activePersonId();
    return {
      page: Math.max(1, this.remotePage()),
      pageSize: Math.max(1, this.remotePageSize()),
      sort: this.remoteSort(),
      dir: this.remoteDir(),
      q: this.query().trim() || undefined,
      track: track !== 'All' ? track : undefined,
      opType: type !== 'All' ? type : undefined,
      teamId: this.workspace.teamId() || undefined,
      assigneeId: this.isMine()
        ? selfId
        : this.workspace.personId() || undefined,
      statusScope: this.workspace.statusScope(),
      project: this.workspace.opProject() || undefined,
    };
  }

  private async loadRemoteTickets(): Promise<void> {
    if (!this.api || !this.useRemote()) return;
    const seq = ++this.remoteLoadSeq;
    try {
      const res = await this.api.listWorkItems(this.buildRemoteQuery());
      if (seq !== this.remoteLoadSeq) return;
      const tickets = res.tickets ?? res.items ?? res.result ?? [];
      const rows = this.scorecard.mapTicketsToRows(tickets);
      this.remoteRows.set(rows);
      this.remoteTotal.set(res.count ?? res.total ?? rows.length);
      const meta = res as { unclosedCount?: number; closedCount?: number };
      this.remoteOpenCount.set(meta.unclosedCount ?? rows.filter((r) => r.score === null).length);
      this.remoteClosedCount.set(meta.closedCount ?? rows.filter((r) => r.score !== null).length);
      if (res.page && res.page > 0) this.remotePage.set(res.page);
      if (res.pageSize && res.pageSize > 0) this.remotePageSize.set(res.pageSize);
    } catch (err) {
      if (seq !== this.remoteLoadSeq) return;
      this.error.set(err instanceof Error ? err.message : 'โหลดใบงานจาก API ไม่สำเร็จ');
    }
  }

  protected openTicketDetail(ticketId: string): void {
    this.ticketDetail.open(ticketId);
  }

  protected openSelfUpdate(ticketId: string): void {
    const ticket = this.scorecard.tickets().find((t) => t.id === ticketId);
    if (!ticket) return;
    this.editingTicketId.set(ticket.id);
    this.editWorkflowStatus.set(ticket.workflowStatus ?? (ticket.closed ? 'Done' : 'In Progress'));
    this.editActualMd.set(ticket.actualMd);
    this.editMrLink.set(ticket.mrLink ?? '');
    this.editPocResult.set(ticket.pocResult ?? '');
    this.editBugCause.set(ticket.bugCause ?? '');
    this.editIsPaused.set(!!ticket.isPaused);
    this.editPausedDays.set(ticket.pausedDays ?? 0);
    this.editUnitTestDone.set(!!ticket.dodChecklist?.unitTest);
    this.editMrAttached.set(!!ticket.dodChecklist?.mrLinked || !!ticket.mrLink?.trim());
    this.editNote.set(ticket.note ?? '');
    this.selfUpdateDialog?.open();
  }

  protected closeSelfUpdate(): void {
    this.selfUpdateDialog?.close();
    this.editingTicketId.set(null);
  }

  protected onEditStatusChange(value: string): void {
    if (value) {
      this.editWorkflowStatus.set(value as WorkflowStatus);
    }
  }

  protected onEditPocResultChange(value: string): void {
    this.editPocResult.set(value ?? '');
  }

  protected onEditBugCauseChange(value: string): void {
    this.editBugCause.set(value ?? '');
  }

  protected saveSelfUpdate(): void {
    const id = this.editingTicketId();
    if (!id) return;
    const existing = this.scorecard.tickets().find((t) => t.id === id);
    if (!existing) return;

    const nextStatus = this.editWorkflowStatus();
    const isClosed = nextStatus === 'Done' ? true : existing.closed && this.isMine() ? true : false;
    const mrLink = this.editMrLink().trim();
    const next: Ticket = {
      ...existing,
      workflowStatus: nextStatus,
      closed: isClosed,
      actualMd: Math.max(0, Number(this.editActualMd() ?? existing.actualMd)),
      mrLink: mrLink || existing.mrLink,
      pocResult: this.editPocResult() || existing.pocResult,
      bugCause: this.editBugCause() || existing.bugCause,
      isPaused: this.editIsPaused(),
      blocker: this.editIsPaused() ? true : existing.blocker,
      pausedDays: Math.max(0, Number(this.editPausedDays() ?? 0)),
      dodChecklist: {
        mrLinked: this.editMrAttached() || !!mrLink,
        unitTest: this.editUnitTestDone(),
        stagingVerified: existing.dodChecklist?.stagingVerified ?? false,
      },
      note: this.editNote().trim(),
    };

    this.scorecard.replaceTicket(next);
    this.notice.success(`บันทึกการอัปเดตใบงาน ${id} เรียบร้อยแล้ว`);
    this.closeSelfUpdate();
  }

  protected goToDispute(ticketId: string): void {
    void this.router.navigate(['/quality/disputes'], { queryParams: { ticketId } });
  }

  protected preview() {
    return scoreTicket(this.draft('PREVIEW'));
  }

  protected previewNotes(): string {
    return scorePartNotes(this.preview());
  }

  protected onSearch(value: string): void {
    this.query.set((value ?? '').trim().toLowerCase());
    this.remotePage.set(1);
  }

  protected setTrackFilter(raw: string): void {
    const value = parseWorkspaceTrackFilter(raw);
    this.trackFilter.set(value);
    this.workspace.setTrack(value);
    this.remotePage.set(1);
  }

  protected setTypeFilter(value: string): void {
    const v = (value ?? '').trim() || 'All';
    this.typeFilter.set(v);
    this.workspace.setType(v === 'All' ? '' : v);
    this.remotePage.set(1);
  }

  protected typeTone(label: string): BadgeTone {
    return toneForTicketType(label);
  }

  protected setChoice(field: 'track' | 'type' | 'size' | 'weekOffset' | 'variance' | 'blocker' | 'closed' | 'dodPassed' | 'inTimeBox' | 'childTicketsSized' | 'unplanned' | 'assigneeId', value: string): void {
    if (typeof value !== 'string') {
      return;
    }
    switch (field) {
      case 'track': {
        const parsed = parseWorkspaceTrackFilter(value);
        if (parsed !== 'All') {
          this.track.set(parsed as Track);
        }
        break;
      }
      case 'type':
        if (this.typeOptions.some((option) => option.value === value)) {
          this.type.set(value as TicketType);
        }
        break;
      case 'size':
        if (value === 'XS' || value === 'S' || value === 'M' || value === 'L' || value === 'XL') {
          this.size.set(value);
        }
        break;
      case 'weekOffset':
        this.weekOffset.set(value);
        break;
      case 'variance':
        if (value === 'NONE' || value === 'REQ' || value === 'BLK' || value === 'ENV' || value === 'LEG') {
          this.variance.set(value);
        }
        break;
      case 'blocker':
        this.blocker.set(value);
        break;
      case 'closed':
        this.closed.set(value);
        break;
      case 'dodPassed':
        this.dodPassed.set(value);
        break;
      case 'inTimeBox':
        this.inTimeBox.set(value);
        break;
      case 'childTicketsSized':
        this.childTicketsSized.set(value);
        break;
      case 'unplanned':
        this.unplanned.set(value);
        break;
      case 'assigneeId':
        this.assigneeId.set(value);
        break;
    }
  }

  protected setNumber(field: 'estimateMd' | 'actualMd' | 'reviewRounds' | 'reopenCount', raw: number): void {
    const next = Number.isFinite(raw) ? raw : 0;
    switch (field) {
      case 'estimateMd':
        this.estimateMd.set(next);
        break;
      case 'actualMd':
        this.actualMd.set(next);
        break;
      case 'reviewRounds':
        this.reviewRounds.set(next);
        break;
      case 'reopenCount':
        this.reopenCount.set(next);
        break;
    }
  }

  protected setClosedOnIso(iso: string): void {
    if (!iso) {
      this.closedOn.set(null);
      return;
    }
    const [y, m, d] = iso.split('-').map(Number);
    this.closedOn.set(y && m && d ? new Date(y, m - 1, d) : null);
  }

  protected onModule(value: string): void {
    this.moduleName.set(value ?? '');
  }

  protected alertTone(label: string): BadgeTone {
    return toneForAlertLabel(label);
  }

  protected markReference(args: { data?: object; row?: Element }): void {
    const data = args.data;
    const id = data && 'id' in data ? String(data.id) : '';
    if (!args.row) {
      return;
    }
    if (id === REFERENCE_BUG_ID || id === REFERENCE_SPIKE_ID) {
      args.row.classList.add('reference-row');
    }
    if (data && 'alertLabel' in data && data.alertLabel !== '—') {
      args.row.classList.add('alert-row');
    }
  }

  protected downloadSample(kind: 'csv' | 'json'): void {
    const link = document.createElement('a');
    link.href = kind === 'csv' ? '/samples/closed-tickets.csv' : '/samples/closed-tickets.json';
    link.download = kind === 'csv' ? 'closed-tickets.csv' : 'closed-tickets.json';
    link.click();
  }

  protected async onImport(event: { filesData?: { rawFile?: Blob | string; name?: string }[] }): Promise<void> {
    const item = event.filesData?.[0];
    const raw = item?.rawFile;
    if (!(raw instanceof Blob)) {
      return;
    }
    const name = item?.name ?? '';
    try {
      const text = await raw.text();
      const peopleIds = this.scorecard.people().map((person) => person.id);
      const tickets = name.toLowerCase().endsWith('.json')
        ? parseClosedTicketJson(text, peopleIds)
        : parseClosedTicketCsv(text, peopleIds);
      this.reportImport(this.scorecard.importTickets(tickets), 'นำเข้า');
    } catch (error) {
      this.message.set('');
      this.error.set(error instanceof Error ? error.message : 'นำเข้าไม่สำเร็จ');
    }
  }

  protected async syncMyProject(): Promise<void> {
    try {
      const result = await this.myProject.pullDetailed(this.scorecard.people().map((person) => person.id));
      if (result.source === 'api') {
        await this.scorecard.reloadFromApi();
        const parts = [
          `ซิงก์ OpenProject แล้ว (+${result.sync?.added ?? 0} อัปเดต ${result.sync?.updated ?? 0})`,
        ];
        if (result.sync?.errors?.length) {
          parts.push(`มี error ${result.sync.errors.length} รายการ`);
        }
        this.error.set('');
        this.message.set(parts.join(' · '));
        return;
      }
      this.reportImport(this.scorecard.importTickets(result.tickets), 'ซิงก์จากไฟล์ตัวอย่างในเครื่อง');
    } catch (error) {
      this.message.set('');
      this.error.set(error instanceof Error ? error.message : 'ซิงก์ไม่สำเร็จ');
    }
  }

  protected add(): void {
    const moduleName = this.moduleName().trim();
    if (moduleName.length === 0) {
      this.error.set('ใส่ชื่อโมดูล');
      this.message.set('');
      return;
    }
    if (!this.scorecard.people().some((person) => person.id === this.assigneeId())) {
      this.error.set('เลือกผู้รับผิดชอบ');
      this.message.set('');
      return;
    }
    const week = Number(this.weekOffset());
    if (week !== 0 && week !== 1 && week !== 2) {
      this.error.set('เลือกสัปดาห์ที่ commit');
      this.message.set('');
      return;
    }
    const ticket = this.scorecard.addTicket(this.draft('', moduleName, week));
    this.moduleName.set('');
    this.error.set('');
    const hidden =
      (this.trackFilter() !== 'All' && normalizeTrack(this.trackFilter()) !== normalizeTrack(ticket.track)) ||
      (this.typeFilter() !== 'All' && this.typeFilter() !== ticket.type);
    const text = hidden ? `เพิ่ม ${ticket.id} แล้ว — เปลี่ยนตัวกรองเพื่อดูใบนี้` : `เพิ่ม ${ticket.id} แล้ว`;
    this.message.set(text);
    this.notice.success(text);
  }

  private draft(id: string, moduleName = this.moduleName().trim() || 'Preview', week = Number(this.weekOffset())): Omit<Ticket, 'id'> & { id: string } {
    const isSpike = this.type() === 'Spike';
    return {
      id,
      track: this.track(),
      type: this.type(),
      module: moduleName,
      size: this.size(),
      estimateMd: this.estimateMd() ?? 0,
      actualMd: this.actualMd() ?? 0,
      weekOffset: week,
      reviewRounds: Math.round(this.reviewRounds() ?? 0),
      blocker: this.blocker() === 'yes',
      reopenCount: Math.round(this.reopenCount() ?? 0),
      varianceCode: this.variance(),
      closed: this.closed() === 'yes',
      dodPassed: this.dodPassed() === 'yes',
      inTimeBox: isSpike && this.inTimeBox() === 'yes',
      childTicketsSized: isSpike && this.childTicketsSized() === 'yes',
      unplanned: this.unplanned() === 'yes',
      assigneeId: this.assigneeId(),
      closedOn: this.closed() === 'yes' ? toIsoDate(this.closedOn()) : null,
      workingDaysLeft: null,
      note: '',
    };
  }

  private reportImport(result: { added: readonly string[]; skipped: readonly string[] }, action: string): void {
    const added = result.added.map((id) => this.describeImported(id)).join(', ');
    const skipped = result.skipped.length > 0 ? ` ข้ามใบที่มีอยู่แล้ว ${result.skipped.join(', ')}` : '';
    this.error.set('');
    const text =
      result.added.length > 0
        ? `${action} ${added} แล้ว คะแนนคำนวณจากสูตร ไม่ได้เขียนกลับ${skipped}`
        : `${action} ไม่มีใบใหม่${skipped}`;
    this.message.set(text);
    this.notice.success(text);
  }

  private describeImported(id: string): string {
    const ticket = this.scorecard.tickets().find((item) => item.id === id);
    const total = ticket ? scoreTicket(ticket).total : null;
    return `${id} คะแนน ${total ?? 'ยังไม่ปิด'}`;
  }
}

function toIsoDate(value: Date | null): string | null {
  if (!value) {
    return null;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

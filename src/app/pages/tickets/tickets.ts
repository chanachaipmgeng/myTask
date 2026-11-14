import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePickerModule } from '@syncfusion/ej2-angular-calendars';
import { ButtonModule, ChipListModule } from '@syncfusion/ej2-angular-buttons';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import {
  AggregateService,
  ColumnChooserService,
  ExcelExportService,
  FilterService,
  FreezeService,
  GridComponent,
  GridModule,
  PageService,
  ResizeService,
  SortService,
  ToolbarService,
} from '@syncfusion/ej2-angular-grids';
import { NumericTextBoxModule, TextBoxModule, UploaderModule } from '@syncfusion/ej2-angular-inputs';
import { AccordionModule, ToolbarModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { scorePartNotes } from '../../core/kpi-meaning';
import { MyProjectSyncAdapter } from '../../core/myproject-sync';
import { ScorecardService } from '../../core/scorecard.service';
import { Size, Ticket, TicketType, Track, VarianceCode } from '../../core/models';
import { SIZE_POINTS, SIZE_STANDARD_MD, scoreTicket } from '../../core/scoring';
import { parseClosedTicketCsv, parseClosedTicketJson } from '../../core/ticket-file';
import { ShellNotice } from '../../core/shell-notice';
import { REFERENCE_BUG_ID, REFERENCE_SPIKE_ID } from '../../data/seed';

type TrackFilter = Track | 'All';
type TypeFilter = TicketType | 'All';

@Component({
  selector: 'app-tickets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    GridModule,
    DropDownListModule,
    NumericTextBoxModule,
    TextBoxModule,
    UploaderModule,
    DatePickerModule,
    AccordionModule,
    ToolbarModule,
    ButtonModule,
    ChipListModule,
    MessageModule,
  ],
  providers: [
    PageService,
    SortService,
    FilterService,
    FreezeService,
    ResizeService,
    ColumnChooserService,
    ExcelExportService,
    AggregateService,
    ToolbarService,
  ],
  templateUrl: './tickets.html',
})
export class TicketsPage {
  private readonly scorecard = inject(ScorecardService);
  private readonly myProject = inject(MyProjectSyncAdapter);
  private readonly notice = inject(ShellNotice);

  @ViewChild('ticketGrid') private ticketGrid?: GridComponent;

  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly pageSettings = { pageSize: 10 };
  protected readonly filterSettings = { type: 'Menu' };
  protected readonly sortSettings = { columns: [{ field: 'score', direction: 'Descending' }] };
  protected readonly gridToolbar = ['ColumnChooser', 'ExcelExport', 'CsvExport'];
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
  protected readonly trackOptions = [
    { text: 'Implement', value: 'Implement' },
    { text: 'R&D', value: 'RD' },
  ];
  protected readonly trackFilters = [{ text: 'ทุกสาย', value: 'All' }, ...this.trackOptions];
  protected readonly typeOptions = [
    { text: 'Feature', value: 'Feature' },
    { text: 'CR', value: 'CR' },
    { text: 'Bug-Investigate', value: 'Bug-Investigate' },
    { text: 'Bug-Fix', value: 'Bug-Fix' },
    { text: 'Spike', value: 'Spike' },
    { text: 'Ops', value: 'Ops' },
    { text: 'TechDebt', value: 'TechDebt' },
  ];
  protected readonly typeFilters = [{ text: 'ทุกชนิด', value: 'All' }, ...this.typeOptions];
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

  protected readonly rows = computed(() => {
    const track = this.trackFilter();
    const type = this.typeFilter();
    const query = this.query();
    return this.scorecard
      .ticketRows()
      .filter((row) => (track === 'All' || row.track === track) && (type === 'All' || row.type === type))
      .filter((row) => query === '' || `${row.id} ${row.module} ${row.assignee}`.toLowerCase().includes(query));
  });

  protected preview() {
    return scoreTicket(this.draft('PREVIEW'));
  }

  protected previewNotes(): string {
    return scorePartNotes(this.preview());
  }

  protected onSearch(event: { value?: string | null }): void {
    this.query.set((event.value ?? '').trim().toLowerCase());
  }

  protected setTrackFilter(event: { value?: string | null }): void {
    const value = event.value;
    if (value === 'All' || value === 'Implement' || value === 'RD') {
      this.trackFilter.set(value);
    }
  }

  protected setTypeFilter(event: { value?: string | null }): void {
    const value = event.value;
    if (value === 'All' || this.typeOptions.some((option) => option.value === value)) {
      this.typeFilter.set(value as TypeFilter);
    }
  }

  protected setChoice(field: 'track' | 'type' | 'size' | 'weekOffset' | 'variance' | 'blocker' | 'closed' | 'dodPassed' | 'inTimeBox' | 'childTicketsSized' | 'unplanned' | 'assigneeId', event: { value?: string | null }): void {
    const value = event.value;
    if (typeof value !== 'string') {
      return;
    }
    switch (field) {
      case 'track':
        if (value === 'Implement' || value === 'RD') {
          this.track.set(value);
        }
        break;
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

  protected setNumber(field: 'estimateMd' | 'actualMd' | 'reviewRounds' | 'reopenCount', event: { value?: number | null }): void {
    const next = typeof event.value === 'number' ? event.value : 0;
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

  protected setClosedOn(event: { value?: Date | null }): void {
    this.closedOn.set(event.value ?? null);
  }

  protected onModule(event: { value?: string | null }): void {
    this.moduleName.set(event.value ?? '');
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

  protected onGridToolbarClick(args: { item?: { id?: string } }): void {
    const id = args.item?.id ?? '';
    if (id.endsWith('_excelexport')) {
      void this.ticketGrid?.excelExport();
    } else if (id.endsWith('_csvexport')) {
      void this.ticketGrid?.csvExport();
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
      (this.trackFilter() !== 'All' && this.trackFilter() !== ticket.track) ||
      (this.typeFilter() !== 'All' && this.typeFilter() !== ticket.type);
    const text = hidden ? `เพิ่ม ${ticket.id} แล้ว — เปลี่ยนตัวกรองเพื่อดูใบนี้` : `เพิ่ม ${ticket.id} แล้ว`;
    this.message.set(text);
    this.notice.show(text);
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
    this.notice.show(text);
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

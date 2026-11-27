import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import type { DataStateChangeEventArgs } from '@syncfusion/ej2-angular-grids';
import { listOrgTeamOptions } from '../../../../../shared/domain/workspace-scope';
import { canEditAdmin } from '../../../core/admin-settings';
import {
  ApiClient,
  ListQueryParams,
  OpenProjectCatalogEntry,
  listQueryFromGridState,
} from '../../../core/api-client';
import { ScorecardService } from '../../../core/scorecard.service';
import { ShellNotice } from '../../../core/shell-notice';
import {
  FilterChipOption,
  FilterChipsComponent,
  KpiStatCardComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  StatusBadgeComponent,
  totalPages,
} from '../../../shared/ui';
import {
  LIST_PAGE_SIZES,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  SfGridRemoteData,
  listGridOptions,
} from '../../../shared/sf/sf-grid/sf-grid';
import { SfCheckboxComponent } from '../../../shared/sf/sf-checkbox/sf-checkbox';
import { SfDropdownComponent } from '../../../shared/sf/sf-dropdown/sf-dropdown';
import { SfMultiSelectComponent } from '../../../shared/sf/sf-multiselect/sf-multiselect';
import { SfPagerChange, SfPagerComponent } from '../../../shared/sf/sf-pager/sf-pager';
import { SfProgressComponent } from '../../../shared/sf/sf-progress/sf-progress';
import { SfTextBoxComponent } from '../../../shared/sf/sf-textbox/sf-textbox';

const DEFAULT_PAGE_SIZE = 12;

@Component({
  selector: 'app-admin-projects',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonModule,
    FilterChipsComponent,
    PageHeadComponent,
    SectionCardComponent,
    StatusBadgeComponent,
    KpiStatCardComponent,
    PersonAvatarComponent,
    SfProgressComponent,
    SfGridComponent,
    SfCheckboxComponent,
    SfDropdownComponent,
    SfMultiSelectComponent,
    SfPagerComponent,
    SfTextBoxComponent,
  ],
  templateUrl: './admin-projects.html',
  styleUrl: './admin-projects.scss',
})
export class AdminProjectsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  private readonly router = inject(Router);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly projects = signal<OpenProjectCatalogEntry[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly syncing = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly filterStatus = signal<'all' | 'active' | 'inactive'>('all');
  protected readonly filterTeam = signal('');
  protected readonly viewMode = signal<'cards' | 'table'>('cards');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly sortField = signal('name');
  protected readonly sortDir = signal<'asc' | 'desc'>('asc');

  protected readonly summary = signal({
    totalProjects: 0,
    activeProjects: 0,
    totalActiveTickets: 0,
    unassignedTeamsCount: 0,
  });

  protected readonly canEdit = canEditAdmin;

  protected readonly orgTeams = computed(() =>
    listOrgTeamOptions(this.scorecard.people(), this.scorecard.teams()),
  );

  protected readonly teamSelectOptions = computed(() =>
    this.orgTeams().map((t: { id: string; label: string }) => ({
      text: t.label,
      value: t.id,
    })),
  );

  protected readonly teamFilterOptions = computed(() => [
    { text: 'ทุกทีม', value: '' },
    ...this.teamSelectOptions(),
  ]);

  protected readonly sortOptions = [
    { text: 'ชื่อโปรเจกต์ (ก-ฮ)', value: 'name:asc' },
    { text: 'ชื่อโปรเจกต์ (ฮ-ก)', value: 'name:desc' },
    { text: 'รหัสโปรเจกต์', value: 'identifier:asc' },
    { text: 'ใบค้างมาก → น้อย', value: 'activeTicketsCount:desc' },
    { text: 'ความคืบหน้าสูง → ต่ำ', value: 'progressPercent:desc' },
    { text: 'กำหนดส่งถัดไป', value: 'nextDueOn:asc' },
  ];

  protected readonly sortValue = computed(
    () => `${this.sortField()}:${this.sortDir()}`,
  );

  protected readonly statusFilterChips: FilterChipOption[] = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'active', label: 'เฉพาะที่เปิดใช้งาน' },
    { id: 'inactive', label: 'ปิดใช้งาน / ซ่อน' },
  ];

  protected readonly viewModeChips: FilterChipOption[] = [
    { id: 'cards', label: 'การ์ด' },
    { id: 'table', label: 'ตาราง' },
  ];

  protected readonly totalPages = computed(() =>
    totalPages(this.total(), this.pageSize()),
  );

  protected readonly pageLabel = computed(
    () =>
      `แสดง ${this.projects().length} จาก ${this.total()} รายการ · หน้า ${this.page()} / ${this.totalPages()}`,
  );

  protected readonly remoteGridData = computed<SfGridRemoteData<OpenProjectCatalogEntry>>(
    () => ({
      result: this.projects(),
      count: this.total(),
    }),
  );

  protected readonly gridColumns: SfGridColumn[] = [
    { field: 'identifier', headerText: 'รหัสโปรเจกต์', width: 120 },
    { field: 'name', headerText: 'ชื่อโปรเจกต์', width: 170, minWidth: 130 },
    {
      field: 'activeTicketsCount',
      headerText: 'ใบงานคงค้าง',
      width: 110,
      textAlign: 'Right',
      type: 'number',
    },
    {
      field: 'progressPercent',
      headerText: 'ความคืบหน้า %',
      width: 120,
      textAlign: 'Right',
      type: 'number',
    },
    { field: 'assignedTeamIds', headerText: 'ทีมที่รับผิดชอบ', width: 180, minWidth: 150 },
    {
      field: 'active',
      headerText: 'สถานะใช้งาน',
      width: 110,
      textAlign: 'Center',
    },
    {
      field: 'actions',
      headerText: 'จัดการ',
      width: 200,
      textAlign: 'Center',
      allowFiltering: false,
      allowSorting: false,
    },
  ];

  protected readonly gridOptions: SfGridOptions = listGridOptions({
    id: 'admin-projects-catalog-grid-v3',
    height: 520,
    search: true,
    filtering: false,
    paging: true,
    pageSize: DEFAULT_PAGE_SIZE,
    pageSizes: [...LIST_PAGE_SIZES],
    excelExport: true,
    exportFileName: 'openproject-catalog',
    autoFreezeDesktop: 1,
    remote: true,
    sortSettings: { columns: [{ field: 'name', direction: 'Ascending' }] },
  });

  async ngOnInit(): Promise<void> {
    await this.loadProjects();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  protected onStatusFilter(id: string): void {
    if (id === 'all' || id === 'active' || id === 'inactive') {
      this.filterStatus.set(id);
      this.page.set(1);
      void this.loadProjects();
    }
  }

  protected onViewMode(id: string): void {
    if (id === 'cards' || id === 'table') {
      this.viewMode.set(id);
      this.page.set(1);
      void this.loadProjects();
    }
  }

  protected onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      void this.loadProjects();
    }, 300);
  }

  protected onTeamFilter(value: string): void {
    this.filterTeam.set(value ?? '');
    this.page.set(1);
    void this.loadProjects();
  }

  protected onSortChange(value: string): void {
    const [field, dir] = (value || 'name:asc').split(':');
    this.sortField.set(field || 'name');
    this.sortDir.set(dir === 'desc' ? 'desc' : 'asc');
    this.page.set(1);
    void this.loadProjects();
  }

  protected setPage(next: number): void {
    const safe = Math.min(Math.max(1, next), this.totalPages());
    if (safe === this.page()) return;
    this.page.set(safe);
    void this.loadProjects();
  }

  /** Syncfusion Pager บนมุมมองการ์ด — ยิง API ด้วย page/pageSize เดียวกับตาราง */
  protected onCardPagerChange(change: SfPagerChange): void {
    const nextSize = Math.max(1, change.pageSize || this.pageSize());
    const pageCount = totalPages(this.total(), nextSize);
    const nextPage = Math.min(Math.max(1, change.page || 1), pageCount);
    const sizeChanged = nextSize !== this.pageSize();
    if (!sizeChanged && nextPage === this.page()) return;
    this.pageSize.set(nextSize);
    this.page.set(sizeChanged ? 1 : nextPage);
    void this.loadProjects();
  }

  protected onGridDataStateChange(state: DataStateChangeEventArgs): void {
    const mapped = listQueryFromGridState(state);
    if (mapped.page) this.page.set(mapped.page);
    if (mapped.pageSize) this.pageSize.set(mapped.pageSize);
    if (mapped.sort) this.sortField.set(mapped.sort);
    if (mapped.dir) this.sortDir.set(mapped.dir);
    if (mapped.q != null) this.searchQuery.set(mapped.q);
    void this.loadProjects();
  }

  private buildQuery(): ListQueryParams {
    return {
      q: this.searchQuery().trim() || undefined,
      /** การ์ดและตารางบังคับส่ง page เสมอ เพื่อให้ API แบ่งหน้า */
      page: Math.max(1, this.page()),
      pageSize: Math.max(1, this.pageSize()),
      sort: this.sortField(),
      dir: this.sortDir(),
      teamId: this.filterTeam() || undefined,
      active: this.filterStatus() === 'all' ? undefined : this.filterStatus(),
    };
  }

  async loadProjects(): Promise<void> {
    this.loading.set(true);
    try {
      const query = this.buildQuery();
      const res = await this.api.getProjects(query);
      const pageSize = Math.max(1, query.pageSize ?? this.pageSize());
      const page = Math.max(1, query.page ?? this.page());
      let items = res.items ?? res.result ?? res.projects ?? [];
      const total = res.count ?? res.total ?? items.length;

      // กันเคส API เก่าคืนทั้งชุด — ตัดตาม page/pageSize ฝั่ง client
      if (items.length > pageSize) {
        const offset = (page - 1) * pageSize;
        items = items.slice(offset, offset + pageSize);
      }

      this.projects.set(items);
      this.total.set(total);
      this.page.set(res.page && res.page > 0 ? res.page : page);
      // อย่าให้ pageSize จาก API ที่ = total (โหมดไม่แบ่งหน้า) ทับค่า 12
      if (res.pageSize != null && res.pageSize > 0 && res.pageSize <= 100 && res.pageSize < total) {
        this.pageSize.set(res.pageSize);
      } else {
        this.pageSize.set(pageSize);
      }

      if (res.summary) {
        this.summary.set(res.summary);
      } else {
        this.summary.set({
          totalProjects: total,
          activeProjects: items.filter((p) => p.active !== false).length,
          totalActiveTickets: items.reduce((s, p) => s + (p.activeTicketsCount ?? 0), 0),
          unassignedTeamsCount: items.filter(
            (p) => !p.assignedTeamIds || p.assignedTeamIds.length === 0,
          ).length,
        });
      }
    } catch (err) {
      this.notice.error(
        err instanceof Error ? err.message : String(err),
        'โหลดข้อมูลโปรเจกต์ล้มเหลว',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async syncFromOpenProject(): Promise<void> {
    if (!this.canEdit() || this.syncing()) return;
    this.syncing.set(true);
    try {
      const res = await this.api.syncProjects();
      if (res.ok) {
        this.notice.success(
          `อัปเดตและผสานข้อมูลโปรเจกต์เรียบร้อยทั้งหมด ${res.total} รายการ`,
          'ซิงก์โปรเจกต์สำเร็จ',
        );
        await this.loadProjects();
        await this.scorecard.reloadFromApi();
      } else {
        this.notice.error(res.message || '', 'ซิงก์โปรเจกต์ไม่สำเร็จ');
      }
    } catch (err) {
      this.notice.error(
        err instanceof Error ? err.message : String(err),
        'เกิดข้อผิดพลาดในการซิงก์',
      );
    } finally {
      this.syncing.set(false);
    }
  }

  async onToggleActive(
    project: OpenProjectCatalogEntry,
    nextActive: boolean,
  ): Promise<void> {
    if (!this.canEdit()) return;
    try {
      const res = await this.api.updateProject(project.id, {
        active: nextActive,
      });
      if (res.ok) {
        this.notice.success(
          `โปรเจกต์ ${project.name} ${nextActive ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว'}`,
          'อัปเดตสถานะสำเร็จ',
        );
        await this.loadProjects();
        await this.scorecard.reloadFromApi();
      } else {
        this.notice.error(res.message || '', 'อัปเดตล้มเหลว');
      }
    } catch (err) {
      this.notice.error(
        err instanceof Error ? err.message : String(err),
        'เกิดข้อผิดพลาด',
      );
    }
  }

  async onTeamsChange(
    project: OpenProjectCatalogEntry,
    teams: string[],
  ): Promise<void> {
    if (!this.canEdit()) return;
    try {
      const res = await this.api.updateProject(project.id, {
        assignedTeamIds: teams,
      });
      if (res.ok) {
        this.notice.success(
          `กำหนดทีมสำหรับโปรเจกต์ ${project.name} เรียบร้อยแล้ว`,
          'บันทึกทีมสำเร็จ',
        );
        await this.loadProjects();
        await this.scorecard.reloadFromApi();
      } else {
        this.notice.error(res.message || '', 'บันทึกทีมล้มเหลว');
      }
    } catch (err) {
      this.notice.error(
        err instanceof Error ? err.message : String(err),
        'เกิดข้อผิดพลาด',
      );
    }
  }

  viewTickets(project: OpenProjectCatalogEntry): void {
    this.router.navigate(['/work/list'], {
      queryParams: { project: project.identifier },
    });
  }

  openProjectDetail(project: OpenProjectCatalogEntry): void {
    void this.router.navigate(['/org/projects', project.id || project.identifier]);
  }

  projectInitials(project: OpenProjectCatalogEntry): string {
    const raw = (project.identifier || project.name || '?').trim();
    return raw.slice(0, 2).toUpperCase();
  }

  teamLabels(project: OpenProjectCatalogEntry): string {
    const ids = project.assignedTeamIds ?? [];
    if (!ids.length) return 'ทุกทีม';
    const map = new Map(this.orgTeams().map((t) => [t.id, t.label]));
    return ids.map((id) => map.get(id) ?? id).join(' · ');
  }

  personName(personId: string): string {
    const person = this.scorecard.peopleById().get(personId);
    return person?.nickname || person?.fullName || personId;
  }

  assigneeOverflow(project: OpenProjectCatalogEntry): number {
    const ids = project.sampleAssigneeIds ?? [];
    return Math.max(0, ids.length - 4);
  }

  visibleAssignees(project: OpenProjectCatalogEntry): string[] {
    return (project.sampleAssigneeIds ?? []).slice(0, 4);
  }

  formatDue(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}

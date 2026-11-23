import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { listOrgTeamOptions } from '../../../../../shared/domain/workspace-scope';
import { canEditAdmin } from '../../../core/admin-settings';
import { ApiClient, OpenProjectCatalogEntry } from '../../../core/api-client';
import { ScorecardService } from '../../../core/scorecard.service';
import { ShellNotice } from '../../../core/shell-notice';
import {
  KpiStatCardComponent,
  PageHeadComponent,
  SectionCardComponent,
  SfCheckboxComponent,
  SfDropdownComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  SfMultiSelectComponent,
  SfTextBoxComponent,
  StatusBadgeComponent,
  listGridOptions,
} from '../../../shared/ui';

@Component({
  selector: 'app-admin-projects',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonModule,
    PageHeadComponent,
    SectionCardComponent,
    StatusBadgeComponent,
    KpiStatCardComponent,
    SfGridComponent,
    SfCheckboxComponent,
    SfDropdownComponent,
    SfMultiSelectComponent,
    SfTextBoxComponent,
  ],
  templateUrl: './admin-projects.html',
  styleUrl: './admin-projects.scss',
})
export class AdminProjectsComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  private readonly router = inject(Router);

  protected readonly projects = signal<OpenProjectCatalogEntry[]>([]);
  protected readonly loading = signal(false);
  protected readonly syncing = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly filterStatus = signal<'all' | 'active' | 'inactive'>('all');
  protected readonly filterTeam = signal('');

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

  protected readonly statusFilterChips = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'active', label: 'เฉพาะที่เปิดใช้งาน' },
    { id: 'inactive', label: 'ปิดใช้งาน / ซ่อน' },
  ];

  // KPI Metrics
  protected readonly totalProjects = computed(() => this.projects().length);
  protected readonly activeProjects = computed(
    () => this.projects().filter((p) => p.active !== false).length,
  );
  protected readonly activePercentage = computed(() => {
    const total = this.totalProjects();
    return total > 0 ? Math.round((this.activeProjects() / total) * 100) : 0;
  });
  protected readonly totalActiveTickets = computed(() =>
    this.projects().reduce((sum, p) => sum + (p.activeTicketsCount ?? 0), 0),
  );
  protected readonly unassignedTeamsCount = computed(
    () =>
      this.projects().filter(
        (p) => !p.assignedTeamIds || p.assignedTeamIds.length === 0,
      ).length,
  );

  // DataGrid Columns & Options
  protected readonly gridColumns: SfGridColumn[] = [
    { field: 'identifier', headerText: 'รหัสโปรเจกต์', width: 140 },
    { field: 'name', headerText: 'ชื่อโปรเจกต์', width: 220 },
    {
      field: 'activeTicketsCount',
      headerText: 'ใบงานคงค้าง',
      width: 120,
      textAlign: 'Right',
    },
    { field: 'assignedTeamIds', headerText: 'ทีมที่รับผิดชอบ', width: 260 },
    {
      field: 'active',
      headerText: 'สถานะใช้งาน',
      width: 125,
      textAlign: 'Center',
    },
    {
      field: 'actions',
      headerText: 'จัดการ',
      width: 110,
      textAlign: 'Center',
    },
  ];

  protected readonly gridOptions: SfGridOptions = {
    ...listGridOptions,
    paging: true,
    pageSize: 15,
    pageSizes: [10, 15, 25, 50],
    sorting: true,
    filtering: false,
    search: false,
    excelExport: true,
  };

  // Filtered List for Table
  protected readonly filteredProjects = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const status = this.filterStatus();
    const team = this.filterTeam();

    return this.projects().filter((p) => {
      // Status filter
      if (status === 'active' && p.active === false) return false;
      if (status === 'inactive' && p.active !== false) return false;

      // Team filter
      if (team) {
        const teams = p.assignedTeamIds ?? [];
        if (!teams.includes(team)) return false;
      }

      // Search query
      if (q) {
        const matchId = (p.identifier || '').toLowerCase().includes(q);
        const matchName = (p.name || '').toLowerCase().includes(q);
        if (!matchId && !matchName) return false;
      }

      return true;
    });
  });

  async ngOnInit(): Promise<void> {
    await this.loadProjects();
  }

  async loadProjects(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.api.getProjects();
      this.projects.set(res.projects ?? []);
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
        this.projects.update((list) =>
          list.map((item) =>
            item.id === project.id ? { ...item, active: nextActive } : item,
          ),
        );
        this.notice.success(
          `โปรเจกต์ ${project.name} ${nextActive ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว'}`,
          'อัปเดตสถานะสำเร็จ',
        );
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
        this.projects.update((list) =>
          list.map((item) =>
            item.id === project.id
              ? { ...item, assignedTeamIds: teams }
              : item,
          ),
        );
        this.notice.success(
          `กำหนดทีมสำหรับโปรเจกต์ ${project.name} เรียบร้อยแล้ว`,
          'บันทึกทีมสำเร็จ',
        );
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
      queryParams: { opProject: project.identifier },
    });
  }
}


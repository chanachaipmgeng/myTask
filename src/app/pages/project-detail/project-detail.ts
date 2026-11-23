import { SlicePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { GitBranchItem } from '../../../../shared/domain/git-branch';
import {
  ProjectDetail,
  ProjectGitSummary,
} from '../../../../shared/domain/project-detail';
import { currentViewer } from '../../core/admin-settings';
import { ApiClient } from '../../core/api-client';
import { Ticket } from '../../core/models';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { TicketDetailService } from '../../core/ticket-detail.service';
import {
  KpiStatCardComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  SfMultiSelectComponent,
  TicketCreateDialogComponent,
  listGridOptions,
} from '../../shared/ui';

type ProjectDetailTab = 'overview' | 'tickets' | 'git' | 'teams';

interface TabItem {
  id: ProjectDetailTab;
  text: string;
  icon: string;
}

const TABS: TabItem[] = [
  { id: 'overview', text: 'ภาพรวม & สุขภาพ', icon: 'e-icons e-chart' },
  { id: 'tickets', text: 'ใบงานในโปรเจกต์', icon: 'e-icons e-table' },
  { id: 'git', text: 'Git & กิ่งโค้ด', icon: 'e-icons e-refresh' },
  { id: 'teams', text: 'ทีม & บุคลากร', icon: 'e-icons e-people' },
];

@Component({
  selector: 'app-project-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SlicePipe,
    RouterLink,
    ButtonModule,
    PageHeadComponent,
    KpiStatCardComponent,
    SectionCardComponent,
    SfGridComponent,
    SfMultiSelectComponent,
    PersonAvatarComponent,
    TicketCreateDialogComponent,
  ],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.scss',
})
export class ProjectDetailPage {
  @ViewChild('createTicketDialog') createTicketDialog?: TicketCreateDialogComponent;

  readonly TABS = TABS;
  readonly activeTab = signal<ProjectDetailTab>('overview');
  readonly loading = signal<boolean>(true);
  readonly saving = signal<boolean>(false);
  readonly errorMsg = signal<string>('');

  readonly project = signal<ProjectDetail | null>(null);
  readonly gitSummary = signal<ProjectGitSummary | null>(null);
  readonly availableGitRepos = signal<{ id: string; name: string }[]>([]);
  readonly selectedRepoIds = signal<string[]>([]);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiClient);
  private readonly scorecard = inject(ScorecardService);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly notice = inject(ShellNotice);

  readonly canEdit = computed(() => {
    const role = currentViewer().access;
    return role === 'admin' || role === 'lead';
  });

  // Project Work Items from scorecard service
  readonly projectTickets = computed<any[]>(() => {
    const proj = this.project();
    if (!proj) return [];
    const idStr = String(proj.id);
    const ident = proj.identifier.toLowerCase();
    const name = proj.name.toLowerCase();

    return this.scorecard
      .tickets()
      .filter((t) => {
        const opProj = String(t.opProject ?? '').toLowerCase();
        return (
          opProj === idStr ||
          opProj === ident ||
          opProj === name
        );
      })
      .map((t) => ({
        ...t,
        title: t.title || t.note || t.module || t.id,
        assigneeName: this.scorecard.roster().find((person) => person.id === t.assigneeId)?.nickname || t.assigneeId || 'ยังไม่กำหนด',
        dueDate: t.dueOn || t.closedOn || '-',
      }));
  });

  // Tickets DataGrid Options & Columns
  readonly ticketGridOptions: SfGridOptions = listGridOptions({
    id: 'project-detail-tickets-grid-v1',
    paging: true,
    pageSize: 15,
    pageSizes: [10, 15, 25, 50],
    search: false,
    height: 420,
  });

  readonly ticketGridColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'รหัสตั๋ว', width: 120, cellType: 'ticket-link' },
    { field: 'title', headerText: 'หัวข้อใบงาน', width: 280 },
    { field: 'track', headerText: 'สายงาน', width: 110, cellType: 'badge' },
    { field: 'status', headerText: 'สถานะ', width: 120, cellType: 'badge' },
    { field: 'assigneeName', headerText: 'ผู้รับผิดชอบ', width: 150, cellType: 'person', personIdField: 'assigneeId' },
    { field: 'estimateMd', headerText: 'Est. MD', width: 95, textAlign: 'Right', format: 'N2' },
    { field: 'actualMd', headerText: 'Act. MD', width: 95, textAlign: 'Right', format: 'N2' },
    { field: 'dueDate', headerText: 'กำหนดส่ง', width: 110 },
  ];

  // Unmatched branches in this project
  readonly unmatchedBranches = computed<GitBranchItem[]>(() => {
    const summary = this.gitSummary();
    if (!summary) return [];
    return summary.activeBranches.filter((b) => !b.ticketId);
  });

  // Unique Members working on this project
  readonly projectMembers = computed<{ personId: string; name: string; ticketCount: number; totalMd: number }[]>(() => {
    const tickets = this.projectTickets();
    const roster = this.scorecard.roster();
    const map = new Map<string, { personId: string; name: string; ticketCount: number; totalMd: number }>();

    for (const t of tickets) {
      const pid = t.assigneeId || 'unassigned';
      const person = roster.find((p) => p.id === pid);
      const name = person ? `${person.nickname} (${person.fullName})` : pid;
      const existing = map.get(pid) ?? { personId: pid, name, ticketCount: 0, totalMd: 0 };
      existing.ticketCount++;
      existing.totalMd += Number(t.estimateMd) || 0;
      map.set(pid, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.totalMd - a.totalMd);
  });

  constructor() {
    effect(() => {
      const id = this.route.snapshot.paramMap.get('id');
      if (id) {
        this.loadProject(id);
      }
    });
  }

  async loadProject(id: string) {
    this.loading.set(true);
    this.errorMsg.set('');

    try {
      const res = await this.api.getProjectDetail(id);
      if (res.ok && res.project) {
        this.project.set(res.project);
        this.selectedRepoIds.set(res.project.gitRepoIds || []);

        this.loadGitSummary(id);
        this.loadAvailableGitRepos();
      } else {
        this.errorMsg.set(res.message || 'ไม่พบข้อมูลโปรเจกต์');
      }
    } catch (err: any) {
      this.errorMsg.set(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลโปรเจกต์');
    } finally {
      this.loading.set(false);
    }
  }

  async loadGitSummary(id: string) {
    try {
      const res = await this.api.getProjectGitSummary(id);
      if (res.ok && res.summary) {
        this.gitSummary.set(res.summary);
      }
    } catch {
      // ignore git summary errors
    }
  }

  async loadAvailableGitRepos() {
    try {
      const res = await this.api.listGitLabProjects();
      if (res.projects) {
        this.availableGitRepos.set(
          res.projects.map((p: any) => ({ id: String(p.id), name: p.name || p.path })),
        );
      }
    } catch {
      this.availableGitRepos.set([
        { id: '101', name: 'frontend/myhr-portal' },
        { id: '102', name: 'backend/core-api' },
        { id: '103', name: 'mobile/app' },
      ]);
    }
  }

  async saveGitRepoMapping() {
    const proj = this.project();
    if (!proj) return;

    this.saving.set(true);
    try {
      const selectedIds = this.selectedRepoIds();
      const allRepos = this.availableGitRepos();
      const selectedNames = selectedIds.map(
        (id) => allRepos.find((r) => r.id === id)?.name || id,
      );

      const res = await this.api.updateProject(proj.id, {
        gitRepoIds: selectedIds,
        gitRepoNames: selectedNames,
      });

      if (res.ok) {
        this.notice.success('บันทึกการผูก Git Repositories เรียบร้อย', 'สำเร็จ');
        this.project.update((p) =>
          p
            ? {
                ...p,
                gitRepoIds: selectedIds,
                gitRepoNames: selectedNames,
              }
            : null,
        );
        this.loadGitSummary(String(proj.id));
      } else {
        this.notice.error(res.message || 'ไม่สามารถบันทึกได้', 'ผิดพลาด');
      }
    } catch (err: any) {
      this.notice.error(err.message || 'เกิดข้อผิดพลาดในการบันทึก', 'ผิดพลาด');
    } finally {
      this.saving.set(false);
    }
  }

  onTicketGridRowSelected(args: any) {
    const ticketId = args?.data?.id;
    if (ticketId) {
      this.ticketDetail.open(ticketId);
    }
  }

  onCreateTicketFromBranch(branch: GitBranchItem) {
    if (this.createTicketDialog) {
      this.createTicketDialog.open(branch);
    }
  }

  onTicketCreated(newTicketId: any) {
    const id = typeof newTicketId === 'string' ? newTicketId : '';
    this.notice.success(`สร้างใบงาน ${id ? '#' + id : ''} และผูกกับ Branch สำเร็จ`, 'สำเร็จ');
    const proj = this.project();
    if (proj) {
      this.loadGitSummary(String(proj.id));
      this.scorecard.reloadFromApi();
    }
  }
}

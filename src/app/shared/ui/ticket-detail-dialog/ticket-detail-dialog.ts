import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { SlicePipe } from '@angular/common';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { SidebarModule } from '@syncfusion/ej2-angular-navigations';
import { openprojectProjectCatalog } from '../../../core/admin-settings';
import { ApiClient, TicketDetailResponse } from '../../../core/api-client';
import { ScorecardService } from '../../../core/scorecard.service';
import { ShellNotice } from '../../../core/shell-notice';
import { TicketDetailService } from '../../../core/ticket-detail.service';
import { ViewportService } from '../../../core/viewport.service';
import { suggestBranchNameFromTicket } from '../../../../../shared/domain/git-branch';
import {
  GitActivityKind,
  GitActivityRow,
  gitActivityKindLabel,
} from '../../../../../shared/domain/gitlab-activity';
import { scoreTicket } from '../../../../../shared/domain/scoring';
import { evaluatePolicySla, PolicySlaEvaluation } from '../../../../../shared/domain/policy-sla';
import { todayInBangkok, workflowStatusOf } from '../../../../../shared/domain/workflow';
import { SfDatePickerComponent } from '../../sf/sf-datepicker/sf-datepicker';
import { SfDropdownComponent } from '../../sf/sf-dropdown/sf-dropdown';
import { SfNumberComponent } from '../../sf/sf-number/sf-number';
import { SfTabItem, SfTabsComponent } from '../../sf/sf-tabs/sf-tabs';
import { SfTextBoxComponent } from '../../sf/sf-textbox/sf-textbox';
import { BadgeTone, toneForPriority, workflowStatusToneMap } from '../badge';
import { FormFieldComponent } from '../form-field/form-field';
import { PersonAvatarComponent } from '../person-avatar/person-avatar';
import { StatusBadgeComponent } from '../status-badge/status-badge';

@Component({
  selector: 'app-ticket-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    SidebarModule,
    FormFieldComponent,
    PersonAvatarComponent,
    StatusBadgeComponent,
    SlicePipe,
    SfDatePickerComponent,
    SfDropdownComponent,
    SfNumberComponent,
    SfTabsComponent,
    SfTextBoxComponent,
  ],
  templateUrl: './ticket-detail-dialog.html',
  styleUrl: './ticket-detail-dialog.scss',
})
export class TicketDetailDialogComponent {
  private readonly api = inject(ApiClient);
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  private readonly detail = inject(TicketDetailService);
  private readonly viewport = inject(ViewportService);

  protected readonly detailTabs: SfTabItem[] = [
    { id: 'overview', header: 'ภาพรวม' },
    { id: 'activity', header: 'ความเคลื่อนไหว' },
    { id: 'files', header: 'ไฟล์' },
    { id: 'relations', header: 'ความสัมพันธ์' },
    { id: 'people', header: 'คนเกี่ยวข้อง' },
    { id: 'time', header: 'เวลา' },
    { id: 'mr', header: 'โค้ด & MR' },
  ];

  protected readonly loading = signal(false);
  protected readonly data = signal<TicketDetailResponse | null>(null);
  protected readonly logHours = signal(1);
  protected readonly logDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly logComment = signal('');
  protected readonly replyComment = signal('');
  protected readonly workflowStatusToneMap = workflowStatusToneMap;

  protected readonly gitlabProjects = signal<{ text: string; value: string }[]>([]);
  protected readonly branchGitlabProjectId = signal('');
  protected readonly branchName = signal('');
  protected readonly branchRef = signal('main');
  protected readonly creatingBranch = signal(false);
  protected readonly createdBranchUrl = signal<string | null>(null);
  protected readonly ticketGitEvents = signal<GitActivityRow[]>([]);
  protected readonly loadingTicketGit = signal(false);

  protected readonly canCreateBranch = computed(() => {
    const ticket = this.data()?.ticket;
    return !!ticket?.opId;
  });

  protected readonly isOpen = computed(() => !!this.detail.ticketId());
  protected readonly policySla = computed<PolicySlaEvaluation | null>(() => {
    const t = this.data()?.ticket;
    return t ? evaluatePolicySla(t, todayInBangkok()) : null;
  });
  protected readonly drawerWidth = computed(() =>
    this.viewport.isMobile()
      ? typeof window !== 'undefined'
        ? `${Math.max(280, window.innerWidth)}px`
        : '100vw'
      : '640px',
  );

  constructor() {
    effect(() => {
      const id = this.detail.ticketId();
      if (id) {
        void this.load(id);
      } else {
        this.data.set(null);
      }
    });
  }

  protected onClose(): void {
    this.detail.close();
    this.data.set(null);
    this.ticketGitEvents.set([]);
  }

  protected onDrawerClose(): void {
    if (this.detail.ticketId()) {
      this.detail.close();
    }
  }

  protected async refresh(): Promise<void> {
    const id = this.detail.ticketId();
    if (id) {
      await this.load(id);
    }
  }

  protected formatStamp(raw: string | null | undefined): string {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return String(raw).slice(0, 16).replace('T', ' ');
    }
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  protected formatFileSize(bytes: number | null | undefined): string {
    const n = typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : 0;
    if (n <= 0) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected relatedTicketId(rel: {
    fromId: number | null;
    toId: number | null;
  }): string | null {
    const currentOp = this.data()?.ticket?.opId ?? null;
    const other =
      currentOp != null && rel.fromId === currentOp
        ? rel.toId
        : currentOp != null && rel.toId === currentOp
          ? rel.fromId
          : (rel.toId ?? rel.fromId);
    return other != null ? `OP-${other}` : null;
  }

  protected openRelated(ticketId: string): void {
    this.detail.open(ticketId);
  }

  protected async submitTime(): Promise<void> {
    const id = this.detail.ticketId();
    if (!id) return;
    if (!this.data()?.writeback) {
      this.notice.warning('เปิด OPENPROJECT_WRITEBACK เมื่อตรวจข้อมูลจริงแล้ว', 'Writeback ปิดอยู่');
      return;
    }
    try {
      const res = await this.api.createTimeEntry(id, {
        hours: this.logHours(),
        spentOn: this.logDate(),
        comment: this.logComment().trim() || undefined,
      });
      if (!res.ok) {
        this.notice.error(res.message ?? 'เกิดข้อผิดพลาด', 'ลงเวลาไม่สำเร็จ');
        return;
      }
      this.notice.success(`บันทึก ${this.logHours()} ชม.`, 'ลงเวลาแล้ว');
      this.logComment.set('');
      await this.load(id);
    } catch (err) {
      this.notice.error(err instanceof Error ? err.message : String(err), 'ลงเวลาไม่สำเร็จ');
    }
  }

  protected async submitComment(): Promise<void> {
    const id = this.detail.ticketId();
    const comment = this.replyComment().trim();
    if (!id || !comment) return;
    if (!this.data()?.writeback) {
      this.notice.warning('เปิด OPENPROJECT_WRITEBACK เมื่อตรวจข้อมูลจริงแล้ว', 'Writeback ปิดอยู่');
      return;
    }
    try {
      const res = await this.api.postWorkItemComment(id, comment);
      if (!res.ok) {
        this.notice.error(res.message ?? 'เกิดข้อผิดพลาด', 'ส่งคอมเมนต์ไม่สำเร็จ');
        return;
      }
      this.notice.success('โพสต์กลับ myProject สำเร็จ', 'ส่งคอมเมนต์แล้ว');
      this.replyComment.set('');
      await this.load(id);
    } catch (err) {
      this.notice.error(err instanceof Error ? err.message : String(err), 'ส่งคอมเมนต์ไม่สำเร็จ');
    }
  }

  protected async createBranch(): Promise<void> {
    const ticket = this.data()?.ticket;
    if (!ticket?.opId) {
      this.notice.warning('ใบงานต้องมีรหัส OpenProject ก่อน', 'สร้าง branch ไม่ได้');
      return;
    }
    const gitlabProjectId = this.branchGitlabProjectId().trim();
    if (!gitlabProjectId) {
      this.notice.warning('เลือกโปรเจกต์ GitLab ก่อน', 'สร้าง branch');
      return;
    }
    const branchName = this.branchName().trim();
    if (!branchName) {
      this.notice.warning('ระบุชื่อ branch', 'สร้าง branch');
      return;
    }
    this.creatingBranch.set(true);
    try {
      const res = await this.api.createBranchFromTicket({
        ticketId: ticket.id,
        gitlabProjectId,
        branchName,
        ref: this.branchRef().trim() || undefined,
      });
      if (!res.ok) {
        this.notice.error(res.message ?? 'เกิดข้อผิดพลาด', 'สร้าง branch ไม่สำเร็จ');
        return;
      }
      this.createdBranchUrl.set(res.webUrl ?? null);
      const sourceLabel = res.source === 'offline' ? ' (โหมดจำลอง)' : '';
      this.notice.success(
        `${res.branchName ?? branchName}${sourceLabel}`,
        'สร้าง branch แล้ว',
      );
      if (res.webUrl && typeof window !== 'undefined') {
        window.open(res.webUrl, '_blank', 'noopener');
      }
    } catch (err) {
      this.notice.error(err instanceof Error ? err.message : String(err), 'สร้าง branch ไม่สำเร็จ');
    } finally {
      this.creatingBranch.set(false);
    }
  }

  protected ciTone(status: string): BadgeTone {
    switch (status) {
      case 'passed':
        return 'success';
      case 'failed':
        return 'danger';
      case 'running':
        return 'warning';
      default:
        return 'secondary';
    }
  }

  protected activityKindLabel(kind: GitActivityKind): string {
    return gitActivityKindLabel(kind);
  }

  protected formatActivityTime(raw: string): string {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 16).replace('T', ' ');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  protected priorityTone(label: string): BadgeTone {
    return toneForPriority(label);
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.createdBranchUrl.set(null);
    this.ticketGitEvents.set([]);
    try {
      if (this.scorecard.usingApi()) {
        const res = await this.api.getWorkItemDetail(id);
        this.data.set(res);
        if (!res.ok) {
          const local = this.offlineDetail(id);
          if (local) {
            this.data.set(local);
          } else {
            this.notice.warning(res.message ?? id, 'ไม่พบใบงาน');
          }
        }
      } else {
        const local = this.offlineDetail(id);
        this.data.set(
          local ?? {
            ok: false,
            source: 'offline',
            writeback: false,
            message: `ไม่พบใบงาน ${id}`,
          },
        );
      }
      this.prepareBranchForm(this.data()?.ticket ?? null);
      if (this.data()?.ticket?.opId) {
        void this.loadGitlabProjects(this.data()?.ticket?.opProject);
      }
      void this.loadTicketGitActivity(this.data()?.ticket ?? null);
    } catch {
      const local = this.offlineDetail(id);
      this.data.set(
        local ?? {
          ok: false,
          source: 'offline',
          writeback: false,
          message: `ไม่พบใบงาน ${id}`,
        },
      );
      this.prepareBranchForm(this.data()?.ticket ?? null);
      this.ticketGitEvents.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadTicketGitActivity(
    ticket: TicketDetailResponse['ticket'] | null | undefined,
  ): Promise<void> {
    if (!ticket?.assigneeId || !this.scorecard.usingApi()) {
      this.ticketGitEvents.set([]);
      return;
    }
    this.loadingTicketGit.set(true);
    try {
      const res = await this.api.getPersonGitSummary(ticket.assigneeId, {
        ticketId: ticket.id,
        days: 90,
      });
      this.ticketGitEvents.set((res.events ?? []).slice(0, 20));
    } catch {
      this.ticketGitEvents.set([]);
    } finally {
      this.loadingTicketGit.set(false);
    }
  }

  private prepareBranchForm(
    ticket: TicketDetailResponse['ticket'] | null | undefined,
  ): void {
    if (!ticket?.opId) {
      this.branchName.set('');
      this.branchGitlabProjectId.set('');
      this.branchRef.set('main');
      return;
    }
    try {
      this.branchName.set(
        suggestBranchNameFromTicket({
          opId: ticket.opId,
          title: ticket.title ?? ticket.module,
          type: ticket.opType ?? ticket.type,
        }),
      );
    } catch {
      this.branchName.set(`feat/OP-${ticket.opId}`);
    }
    this.branchRef.set('main');
  }

  private async loadGitlabProjects(opProject?: string | null): Promise<void> {
    try {
      const res = await this.api.listGitLabProjects();
      const all = (res.projects ?? []).map((p) => ({
        text: p.path || p.name || p.id,
        value: String(p.id),
      }));
      const preferredIds = this.preferredGitRepoIds(opProject);
      const preferred = preferredIds.length
        ? all.filter((p) => preferredIds.includes(p.value))
        : [];
      const items = preferred.length > 0 ? preferred : all;
      this.gitlabProjects.set(items);
      if (!this.branchGitlabProjectId() && items[0]) {
        this.branchGitlabProjectId.set(items[0].value);
      }
    } catch {
      this.gitlabProjects.set([]);
    }
  }

  private preferredGitRepoIds(opProject?: string | null): string[] {
    const key = (opProject ?? '').trim().toLowerCase();
    if (!key) return [];
    const match = openprojectProjectCatalog().find(
      (p) =>
        p.identifier.toLowerCase() === key ||
        (p.name ?? '').toLowerCase() === key ||
        String(p.id) === key,
    );
    return (match?.gitRepoIds ?? []).map(String);
  }

  private offlineDetail(id: string): TicketDetailResponse | null {
    const ticket = this.scorecard.tickets().find((t) => t.id.toUpperCase() === id.toUpperCase());
    if (!ticket) return null;
    const scores = scoreTicket(ticket);
    return {
      ok: true,
      source: 'offline',
      writeback: false,
      ticket: { ...ticket, workflowStatus: workflowStatusOf(ticket) },
      scores: {
        week: scores.week,
        accuracy: scores.accuracy,
        review: scores.review,
        reopen: scores.reopen,
        total: scores.total,
      },
      description: '',
      authorName: null,
      createdAt: null,
      updatedAt: null,
      projectTitle: ticket.opProject ?? null,
      relations: [],
      attachments: [],
      watchers: [],
      timeEntries: ticket.actualMd
        ? [
            {
              id: 0,
              spentOn: String(ticket.closedOn || ticket.dueOn || '').slice(0, 10),
              hours: Math.round(ticket.actualMd * 6 * 100) / 100,
              userTitle: ticket.assigneeId,
              comment: 'จากข้อมูลในสกอร์การ์ด (โหมดออฟไลน์)',
            },
          ]
        : [],
      activities: [],
      mrs: ticket.mrLink
        ? [
            {
              iid: 0,
              projectId: '',
              title: ticket.mrLink,
              webUrl: ticket.mrLink,
              state: 'linked',
              ciStatus: 'unknown',
              commitSpan: { firstCommitOn: null, lastCommitOn: null, commitCount: 0 },
              unresolvedThreads: 0,
              reviewRounds: ticket.reviewRounds ?? 1,
              reviewers: ticket.reviewers ?? [],
            },
          ]
        : [],
      opUrl: null,
      errors: [],
    };
  }
}

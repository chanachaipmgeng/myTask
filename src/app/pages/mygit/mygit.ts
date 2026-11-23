import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { canAssignWork, currentViewer } from '../../core/admin-settings';
import { ApiClient, GitLabIntegration, OpenMrItem } from '../../core/api-client';
import { currentSession } from '../../core/session';
import { ShellNotice } from '../../core/shell-notice';
import { MyGitMatch, MyGitSyncAdapter, MyGitUnmatched } from '../../core/mygit-sync';
import { ScorecardService } from '../../core/scorecard.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../core/workspace-filter';
import {
  BadgeTone,
  PageHeadComponent,
  SectionCardComponent,
  SfCheckboxComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
  SfMessageComponent,
  StatusBadgeComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-mygit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonModule,
    PageHeadComponent,
    SectionCardComponent,
    StatusBadgeComponent,
    SfCheckboxComponent,
    SfGridComponent,
    SfMessageComponent,
  ],
  templateUrl: './mygit.html',
})
export class MyGitPage {
  private readonly route = inject(ActivatedRoute);
  private readonly mygit = inject(MyGitSyncAdapter);
  private readonly scorecard = inject(ScorecardService);
  private readonly workspace = inject(WorkspaceFilter);
  private readonly notice = inject(ShellNotice);
  private readonly api = inject(ApiClient, { optional: true });
  private readonly ticketDetail = inject(TicketDetailService);

  protected readonly isMine = this.route.snapshot.data['scope'] === 'mine';
  protected readonly activePersonId = computed(
    () => currentSession()?.person.id ?? currentViewer().id,
  );
  protected readonly assignedToMe = signal(true);
  protected readonly openMrs = signal<OpenMrItem[]>([]);
  protected readonly openMrSource = signal<'live' | 'offline'>('offline');
  protected readonly loadingOpenMrs = signal(false);
  protected readonly myTicketsWithMr = computed(() => {
    const selfId = this.activePersonId();
    const tickets = this.isMine
      ? this.scorecard.tickets().filter((t) => t.assigneeId === selfId)
      : this.workspace.applyToTickets(this.scorecard.tickets());
    return tickets.map((t) => ({
      id: t.id,
      title: t.title || t.module,
      status: t.workflowStatus ?? (t.closed ? 'Done' : 'In Progress'),
      mrLink: t.mrLink?.trim() || 'ยังไม่แนบลิงก์ MR',
      hasMr: !!t.mrLink?.trim(),
      reviewRounds: t.reviewRounds,
      reopenCount: t.reopenCount,
    }));
  });

  protected readonly canSyncApi = canAssignWork;
  protected readonly openMrColumns: SfGridColumn[] = [
    { field: 'title', headerText: 'Merge Request', width: 260 },
    { field: 'ticketId', headerText: 'ใบงาน', width: 120 },
    { field: 'ageHours', headerText: 'ค้าง (ชม.)', width: 100, textAlign: 'Right' },
    { field: 'ciStatus', headerText: 'CI', width: 110 },
    { field: 'reviewers', headerText: 'Reviewers', width: 160 },
    { field: 'webUrl', headerText: 'ลิงก์', width: 180 },
  ];
  protected readonly openMrGridOptions: SfGridOptions = listGridOptions({
    id: 'mygit-open-mrs-grid',
    height: '240',
    excelExport: true,
    csvExport: true,
    exportFileName: 'open-mrs',
  });
  protected readonly myTicketsMrColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'รหัสใบงาน', width: 120 },
    { field: 'title', headerText: 'ชื่องาน / โมดูล', width: 220 },
    { field: 'status', headerText: 'สถานะงาน', width: 140 },
    { field: 'mrLink', headerText: 'ลิงก์ Merge Request', width: 260 },
    { field: 'reviewRounds', headerText: 'รอบรีวิว', width: 85, textAlign: 'Right' },
    { field: 'reopenCount', headerText: 'Reopen', width: 85, textAlign: 'Right' },
  ];
  protected readonly myTicketsMrGridOptions: SfGridOptions = listGridOptions({
    id: 'mygit-my-tickets-grid',
    height: '240',
  });
  protected readonly matchedColumns: SfGridColumn[] = [
    { field: 'sha', headerText: 'Commit / MR', width: 120 },
    { field: 'ticketId', headerText: 'ใบงาน', width: 140 },
    { field: 'reviewRounds', headerText: 'รอบรีวิว', width: 110, textAlign: 'Right' },
    { field: 'reopenCount', headerText: 'Reopen', width: 100, textAlign: 'Right' },
    { field: 'reviewBefore', headerText: 'คะแนนรีวิวก่อน', width: 140, textAlign: 'Right' },
    { field: 'reviewAfter', headerText: 'คะแนนรีวิวหลัง', width: 140, textAlign: 'Right' },
    { field: 'mrLink', headerText: 'ลิงก์ MR', width: 220 },
    { field: 'mergedAt', headerText: 'เวลา merge', width: 190 },
    { field: 'message', headerText: 'ข้อความ', width: 260 },
  ];
  protected readonly matchedGridOptions: SfGridOptions = listGridOptions({
    id: 'mygit-matched-grid',
    height: '220',
    excelExport: true,
    exportFileName: 'mygit-matched',
  });
  protected readonly unmatchedColumns: SfGridColumn[] = [
    { field: 'sha', headerText: 'Commit / MR', width: 120 },
    { field: 'ticketId', headerText: 'รหัสที่อ้าง', width: 140 },
    { field: 'mergedAt', headerText: 'เวลา merge', width: 200 },
    { field: 'message', headerText: 'ข้อความ', width: 320 },
  ];
  protected readonly unmatchedGridOptions: SfGridOptions = listGridOptions({
    id: 'mygit-unmatched-grid',
    height: '180',
  });
  protected readonly matched = signal<MyGitMatch[]>([]);
  protected readonly unmatched = signal<MyGitUnmatched[]>([]);
  protected readonly gitlabInfo = signal<GitLabIntegration | null>(null);
  protected readonly syncing = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly synced = signal(false);

  constructor() {
    void this.loadGitLabStatus();
    void this.loadOpenMrs();
  }

  private async loadGitLabStatus(): Promise<void> {
    if (!this.api || !this.scorecard.usingApi()) {
      return;
    }
    try {
      const info = await this.api.getGitLab();
      this.gitlabInfo.set(info);
    } catch {
      // ignore offline
    }
  }

  protected async loadOpenMrs(): Promise<void> {
    this.loadingOpenMrs.set(true);
    try {
      if (!this.api || !this.scorecard.usingApi()) {
        this.openMrSource.set('offline');
        this.openMrs.set(this.offlineOpenMrs());
        return;
      }
      const res = await this.api.getOpenMrs(this.assignedToMe());
      this.openMrSource.set(res.source);
      this.openMrs.set(res.items ?? []);
      if (res.message) {
        this.notice.warning(res.message);
      }
    } catch {
      this.openMrSource.set('offline');
      this.openMrs.set(this.offlineOpenMrs());
    } finally {
      this.loadingOpenMrs.set(false);
    }
  }

  protected onAssignedFilter(checked: boolean): void {
    this.assignedToMe.set(checked);
    void this.loadOpenMrs();
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

  protected openTicket(id: string): void {
    if (id) this.ticketDetail.open(id);
  }

  private offlineOpenMrs(): OpenMrItem[] {
    const selfGit = (
      currentSession()?.person.gitlabUsername ||
      this.scorecard.roster().find((p) => p.id === this.activePersonId())?.gitlabUsername ||
      ''
    ).toLowerCase();
    return this.scorecard
      .tickets()
      .filter((t) => !!t.mrLink?.trim() && !t.closed)
      .filter((t) => {
        if (!this.assignedToMe() || !selfGit) return true;
        const reviewers = (t.reviewers ?? []).map((r) => r.toLowerCase());
        return reviewers.includes(selfGit) || t.assigneeId !== this.activePersonId();
      })
      .slice(0, 12)
      .map((t, index) => ({
        projectId: 'offline',
        iid: index + 1,
        title: t.title || t.mrLink || t.id,
        webUrl: t.mrLink || '',
        author: t.assigneeId,
        reviewers: t.reviewers ?? [],
        ticketId: t.id,
        ageHours: 8 + index,
        ciStatus: (index % 3 === 0 ? 'passed' : index % 3 === 1 ? 'running' : 'failed') as any,
        createdAt: '',
        updatedAt: '',
      }));
  }

  protected async sync(): Promise<void> {
    try {
      const commits = await this.mygit.pull();
      const result = this.scorecard.applyMyGit(commits);
      this.matched.set(result.matched);
      this.unmatched.set(result.unmatched);
      this.synced.set(true);
      this.error.set('');
      const text = 'ซิงก์จากไฟล์ตัวอย่างในเครื่องแล้ว ไม่ได้เขียนคะแนนกลับ';
      this.message.set(text);
      this.notice.success(text);
    } catch (error) {
      this.message.set('');
      const text = error instanceof Error ? error.message : 'ซิงก์ไม่สำเร็จ';
      this.error.set(text);
      this.notice.error(text);
    }
  }

  protected async syncFromGitLabApi(): Promise<void> {
    if (!this.api || !this.canSyncApi()) {
      return;
    }
    this.syncing.set(true);
    this.error.set('');
    try {
      const result = await this.api.syncGitLab();
      if (!result.ok && result.message) {
        this.error.set(result.message);
        this.notice.error(result.message);
        return;
      }
      await this.scorecard.reloadFromApi();
      const matchedList = result.matched ?? [];
      const unmatchedList = result.unmatched ?? [];
      const errorsList = result.errors ?? [];
      this.matched.set(
        matchedList.map((item) => ({
          sha: item.sha,
          ticketId: item.ticketId,
          mergedAt: item.mergedAt,
          reviewRounds: item.reviewRounds,
          reopenCount: item.reopenCount,
          message: item.message,
          mrLink: item.mrLink,
          reviewBefore: item.reviewBefore,
          reviewAfter: item.reviewAfter,
        })),
      );
      this.unmatched.set(unmatchedList);
      this.synced.set(true);
      if (errorsList.length > 0) {
        const text = errorsList.join(' | ');
        this.error.set(text);
        this.notice.warning(text);
      } else {
        const text = `ซิงก์จาก GitLab API สำเร็จ · จับคู่ ${result.updated ?? matchedList.length} ใบ · ไม่ตรง ${unmatchedList.length} รายการ`;
        this.message.set(text);
        this.notice.success(text);
      }
    } catch (err) {
      this.message.set('');
      const text = err instanceof Error ? err.message : 'ซิงก์ GitLab API ไม่สำเร็จ';
      this.error.set(text);
      this.notice.error(text);
    } finally {
      this.syncing.set(false);
    }
  }
}

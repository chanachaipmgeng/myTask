import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { GridModule, PageService } from '@syncfusion/ej2-angular-grids';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { canAssignWork, currentViewer } from '../../core/admin-settings';
import { ApiClient, GitLabIntegration, OpenMrItem } from '../../core/api-client';
import { currentSession } from '../../core/session';
import { ShellNotice } from '../../core/shell-notice';
import { MyGitMatch, MyGitSyncAdapter, MyGitUnmatched } from '../../core/mygit-sync';
import { ScorecardService } from '../../core/scorecard.service';
import { TicketDetailService } from '../../core/ticket-detail.service';
import { BadgeTone } from '../../shared/ui/badge';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge';

@Component({
  selector: 'app-mygit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    GridModule,
    ButtonModule,
    CheckBoxModule,
    MessageModule,
    PageHeadComponent,
    SectionCardComponent,
    StatusBadgeComponent,
  ],
  providers: [PageService],
  templateUrl: './mygit.html',
})
export class MyGitPage {
  private readonly route = inject(ActivatedRoute);
  private readonly mygit = inject(MyGitSyncAdapter);
  private readonly scorecard = inject(ScorecardService);
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
    return this.scorecard
      .tickets()
      .filter((t) => (!this.isMine ? true : t.assigneeId === selfId))
      .map((t) => ({
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
  protected readonly pageSettings = { pageSize: 8 };
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

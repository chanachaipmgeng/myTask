import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { GridModule, PageService } from '@syncfusion/ej2-angular-grids';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { canAssignWork } from '../../core/admin-settings';
import { ApiClient, GitLabIntegration } from '../../core/api-client';
import { ShellNotice } from '../../core/shell-notice';
import { MyGitMatch, MyGitSyncAdapter, MyGitUnmatched } from '../../core/mygit-sync';
import { ScorecardService } from '../../core/scorecard.service';

@Component({
  selector: 'app-mygit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GridModule, ButtonModule, MessageModule],
  providers: [PageService],
  templateUrl: './mygit.html',
})
export class MyGitPage {
  private readonly mygit = inject(MyGitSyncAdapter);
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);
  private readonly api = inject(ApiClient, { optional: true });

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
      this.notice.show(text);
    } catch (error) {
      this.message.set('');
      this.error.set(error instanceof Error ? error.message : 'ซิงก์ไม่สำเร็จ');
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
        this.error.set(errorsList.join(' | '));
      } else {
        const text = `ซิงก์จาก GitLab API สำเร็จ · จับคู่ ${result.updated ?? matchedList.length} ใบ · ไม่ตรง ${unmatchedList.length} รายการ`;
        this.message.set(text);
        this.notice.show(text);
      }
    } catch (err) {
      this.message.set('');
      this.error.set(err instanceof Error ? err.message : 'ซิงก์ GitLab API ไม่สำเร็จ');
    } finally {
      this.syncing.set(false);
    }
  }
}

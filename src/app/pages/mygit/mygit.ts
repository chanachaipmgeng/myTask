import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { GridModule, PageService } from '@syncfusion/ej2-angular-grids';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
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

  protected readonly pageSettings = { pageSize: 8 };
  protected readonly matched = signal<MyGitMatch[]>([]);
  protected readonly unmatched = signal<MyGitUnmatched[]>([]);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly synced = signal(false);

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
}

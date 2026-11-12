import { Component, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { ShellNotice } from '../../core/shell-notice';
import { TeamsNotifyService } from '../../core/teams-notify';
import { ScorecardService } from '../../core/scorecard.service';

@Component({
  selector: 'app-teams',
  imports: [ButtonModule],
  templateUrl: './teams.html',
})
export class TeamsPage {
  private readonly teams = inject(TeamsNotifyService);
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);

  protected readonly channel = this.teams.channel;
  protected readonly deadline = this.teams.deadline;
  protected readonly overrun = this.teams.overrun;
  protected readonly log = this.teams.log;
  protected readonly message = signal('');
  protected readonly error = signal('');

  protected onChannel(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.channel.set(target.value);
    }
  }

  protected onDeadline(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.deadline.set(target.checked);
    }
  }

  protected onOverrun(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.overrun.set(target.checked);
    }
  }

  protected testSend(): void {
    try {
      const entries = this.teams.testSend(this.scorecard.tickets());
      this.error.set('');
      const text =
        entries.length > 0
          ? `บันทึก ${entries.length} ข้อความที่จะส่ง ยังไม่ยิง webhook`
          : 'ไม่มีใบที่เข้าเงื่อนไข';
      this.message.set(text);
      this.notice.show(text);
    } catch (error) {
      this.message.set('');
      this.error.set(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ');
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { GridModule } from '@syncfusion/ej2-angular-grids';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { ShellNotice } from '../../core/shell-notice';
import { TeamsNotifyService } from '../../core/teams-notify';
import { ScorecardService } from '../../core/scorecard.service';

@Component({
  selector: 'app-teams',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, CheckBoxModule, TextBoxModule, GridModule, MessageModule],
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
  protected readonly logRows = computed(() =>
    this.log().map((entry) => ({ ...entry, statusLabel: 'บันทึกไว้ ยังไม่ส่ง' })),
  );
  protected readonly message = signal('');
  protected readonly error = signal('');

  protected onChannel(event: { value?: string | null }): void {
    this.channel.set(event.value ?? '');
  }

  protected onDeadline(event: { checked?: boolean }): void {
    this.deadline.set(Boolean(event.checked));
  }

  protected onOverrun(event: { checked?: boolean }): void {
    this.overrun.set(Boolean(event.checked));
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

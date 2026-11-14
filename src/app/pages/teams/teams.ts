import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { GridModule } from '@syncfusion/ej2-angular-grids';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { canAssignWork } from '../../core/admin-settings';
import { ApiClient, TeamsIntegration } from '../../core/api-client';
import { ShellNotice } from '../../core/shell-notice';
import { TeamsLogEntry, TeamsNotifyService } from '../../core/teams-notify';
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
  private readonly api = inject(ApiClient, { optional: true });

  protected readonly canSend = canAssignWork;
  protected readonly channel = this.teams.channel;
  protected readonly deadline = this.teams.deadline;
  protected readonly overrun = this.teams.overrun;
  protected readonly log = this.teams.log;
  protected readonly sentEntries = signal<(TeamsLogEntry & { statusLabel: string })[] | null>(null);
  protected readonly logRows = computed(() => {
    const sent = this.sentEntries();
    if (sent) {
      return sent;
    }
    return this.log().map((entry) => ({ ...entry, statusLabel: 'บันทึกไว้ ยังไม่ส่ง' }));
  });
  protected readonly teamsInfo = signal<TeamsIntegration | null>(null);
  protected readonly sending = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');

  constructor() {
    void this.loadTeamsStatus();
  }

  private async loadTeamsStatus(): Promise<void> {
    if (!this.api || !this.scorecard.usingApi()) {
      return;
    }
    try {
      const info = await this.api.getTeams();
      this.teamsInfo.set(info);
      if (info.channel) {
        this.channel.set(info.channel);
      }
    } catch {
      // ignore when offline
    }
  }

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
      this.sentEntries.set(null);
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

  protected async sendWebhook(): Promise<void> {
    if (!this.api || !this.canSend()) {
      return;
    }
    this.sending.set(true);
    this.error.set('');
    try {
      const result = await this.api.sendTeams({
        channel: this.channel(),
        deadline: this.deadline(),
        overrun: this.overrun(),
        dryRun: false,
      });
      const msgs = result.messages ?? [];
      const statusLabel = result.sent ? 'ส่งเข้า Teams แล้ว' : 'บันทึกไว้ ยังไม่ส่ง';
      this.sentEntries.set(
        msgs.map((entry, idx) => ({
          id: `${entry.kind}-${entry.ticketId}-${idx}`,
          channel: this.channel(),
          ...entry,
          status: 'stored-not-sent' as const,
          statusLabel,
        })),
      );
      if (!result.ok && result.message) {
        this.error.set(`ส่งเข้า Teams ไม่สำเร็จ: ${result.message}`);
      } else {
        const text = result.sent
          ? `ส่งเข้า Teams สำเร็จ (${msgs.length} ข้อความ)`
          : msgs.length === 0
            ? 'ไม่มีใบที่เข้าเงื่อนไขต้องแจ้งเตือน'
            : `ร่างข้อความ ${msgs.length} รายการ (ยังไม่ได้ตั้งค่า TEAMS_WEBHOOK_URL หรือปิดการส่ง)`;
        this.message.set(text);
        this.notice.show(text);
      }
    } catch (err) {
      this.message.set('');
      this.error.set(err instanceof Error ? err.message : 'ส่งเข้า Teams ไม่สำเร็จ');
    } finally {
      this.sending.set(false);
    }
  }
}

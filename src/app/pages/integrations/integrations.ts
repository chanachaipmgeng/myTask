import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { NumericTextBoxModule, TextAreaModule, TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { GridModule, PageService } from '@syncfusion/ej2-angular-grids';
import { TabModule } from '@syncfusion/ej2-angular-navigations';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import {
  ApiClient,
  GitLabIntegration,
  OpenProjectIntegration,
  TeamsIntegration,
} from '../../core/api-client';
import { canEditAdmin } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { WORKFLOW_STATUSES } from '../../core/models';

type CustomFieldKey =
  | 'size'
  | 'track'
  | 'type'
  | 'variance'
  | 'unplanned'
  | 'storyPoints'
  | 'discipline'
  | 'workCategory'
  | 'reviewRounds'
  | 'blocker'
  | 'dodPassed'
  | 'inTimeBox'
  | 'childTicketsSized'
  | 'mrLink'
  | 'bugCause'
  | 'pocResult'
  | 'firstDueOn'
  | 'weekOffset';

function emptyCustomFields(): Record<CustomFieldKey, string> {
  return {
    size: '',
    track: '',
    type: '',
    variance: '',
    unplanned: '',
    storyPoints: '',
    discipline: '',
    workCategory: '',
    reviewRounds: '',
    blocker: '',
    dodPassed: '',
    inTimeBox: '',
    childTicketsSized: '',
    mrLink: '',
    bugCause: '',
    pocResult: '',
    firstDueOn: '',
    weekOffset: '',
  };
}

@Component({
  selector: 'app-integrations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    CheckBoxModule,
    DropDownListModule,
    NumericTextBoxModule,
    TextAreaModule,
    TextBoxModule,
    GridModule,
    TabModule,
    MessageModule,
  ],
  providers: [PageService],
  templateUrl: './integrations.html',
})
export class IntegrationsPage {
  private readonly api = inject(ApiClient);
  private readonly scorecard = inject(ScorecardService);

  protected readonly canEdit = canEditAdmin;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly data = signal<OpenProjectIntegration | null>(null);
  protected readonly gitlabData = signal<GitLabIntegration | null>(null);
  protected readonly teamsData = signal<TeamsIntegration | null>(null);

  // OpenProject state
  protected readonly baseUrl = signal('');
  protected readonly token = signal('');
  protected readonly enabled = signal(true);
  protected readonly hoursPerMd = signal(6);
  protected readonly statusMapText = signal('');
  protected readonly typeMapText = signal('');
  protected readonly newStatusKey = signal('');
  protected readonly newStatusValue = signal<string>(WORKFLOW_STATUSES[0]);
  protected readonly customFields = signal<Record<CustomFieldKey, string>>(emptyCustomFields());
  protected readonly customFieldRows: { key: CustomFieldKey; label: string; hint: string }[] = [
    { key: 'size', label: 'Size', hint: 'XS S M L XL' },
    { key: 'track', label: 'Track', hint: 'Implement / RD' },
    { key: 'type', label: 'Type', hint: 'Feature / Bug / Spike …' },
    { key: 'variance', label: 'Variance', hint: 'NONE REQ BLK ENV LEG' },
    { key: 'unplanned', label: 'Unplanned', hint: 'boolean' },
    { key: 'storyPoints', label: 'Story points', hint: '1 2 3 5 8 13' },
    { key: 'discipline', label: 'Discipline', hint: 'FE BE Full-Stack …' },
    { key: 'workCategory', label: 'Work category', hint: 'Feature / BugInternal …' },
    { key: 'reviewRounds', label: 'Review rounds', hint: 'integer ≥ 0' },
    { key: 'blocker', label: 'Blocker', hint: 'boolean' },
    { key: 'dodPassed', label: 'DoD passed', hint: 'boolean' },
    { key: 'inTimeBox', label: 'Spike in time-box', hint: 'boolean' },
    { key: 'childTicketsSized', label: 'Children sized', hint: 'boolean' },
    { key: 'mrLink', label: 'MR link', hint: 'URL' },
    { key: 'bugCause', label: 'Bug cause', hint: 'Logic UI API …' },
    { key: 'pocResult', label: 'PoC result', hint: 'Adopted / Dropped …' },
    { key: 'firstDueOn', label: 'First due date', hint: 'ถ้าไม่ใช้ dueDate มาตรฐาน' },
    { key: 'weekOffset', label: 'Week offset', hint: '0 1 2+ ถ้าคำนวณไม่ได้' },
  ];
  protected readonly mapPersonId = signal('');
  protected readonly mapOpUserId = signal<number | null>(null);

  // GitLab state
  protected readonly gitlabBaseUrl = signal('');
  protected readonly gitlabProjectIdsText = signal('');
  protected readonly gitlabToken = signal('');
  protected readonly gitlabEnabled = signal(true);

  // Teams state
  protected readonly teamsChannel = signal('scorecard-alerts');
  protected readonly teamsWebhookUrl = signal('');
  protected readonly teamsEnabled = signal(true);

  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly workflowHint = WORKFLOW_STATUSES.join(', ');
  protected readonly workflowOptions = WORKFLOW_STATUSES.map((status) => ({
    text: status,
    value: status,
  }));

  protected readonly statusMapEntries = computed(() => {
    try {
      const parsed = JSON.parse(this.statusMapText() || '{}') as Record<string, string>;
      return Object.entries(parsed).map(([key, value]) => ({ key, value }));
    } catch {
      return [];
    }
  });

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [info, glInfo, tmInfo] = await Promise.all([
        this.api.getOpenProject(),
        this.api.getGitLab().catch(() => null),
        this.api.getTeams().catch(() => null),
      ]);
      this.data.set(info);
      this.baseUrl.set(info.baseUrl);
      this.enabled.set(info.enabled);
      this.hoursPerMd.set(info.hoursPerMd);
      this.statusMapText.set(JSON.stringify(info.mapping['statusMap'] ?? {}, null, 2));
      this.typeMapText.set(JSON.stringify(info.mapping['typeMap'] ?? {}, null, 2));
      const custom = (info.mapping['customFields'] ?? {}) as Record<string, string>;
      const next = emptyCustomFields();
      for (const row of this.customFieldRows) {
        next[row.key] = custom[row.key] ?? '';
      }
      this.customFields.set(next);

      if (glInfo) {
        this.gitlabData.set(glInfo);
        this.gitlabBaseUrl.set(glInfo.baseUrl);
        this.gitlabProjectIdsText.set(glInfo.projectIds.join(', '));
        this.gitlabEnabled.set(glInfo.enabled);
      }

      if (tmInfo) {
        this.teamsData.set(tmInfo);
        this.teamsChannel.set(tmInfo.channel);
        this.teamsEnabled.set(tmInfo.enabled);
      }

      this.message.set(
        info.configured
          ? `เชื่อมต่อได้ · writeback ${info.writeback ? 'เปิด' : 'ปิด'}`
          : 'ยังไม่ได้ตั้ง URL/token ของ OpenProject',
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'โหลดสถานะ integrations ไม่ได้');
    } finally {
      this.loading.set(false);
    }
  }

  protected addStatusMapping(): void {
    const key = this.newStatusKey().trim();
    const val = this.newStatusValue();
    if (!key || !val) {
      return;
    }
    try {
      const current = JSON.parse(this.statusMapText() || '{}') as Record<string, string>;
      current[key] = val;
      this.statusMapText.set(JSON.stringify(current, null, 2));
      this.newStatusKey.set('');
    } catch {
      this.error.set('แก้ไข JSON statusMap ให้ถูกต้องก่อนเพิ่มรายการ');
    }
  }

  protected removeStatusMapping(key: string): void {
    try {
      const current = JSON.parse(this.statusMapText() || '{}') as Record<string, string>;
      delete current[key];
      this.statusMapText.set(JSON.stringify(current, null, 2));
    } catch {
      // ignore invalid JSON
    }
  }

  protected personOptions(): { text: string; value: string }[] {
    return (this.data()?.people ?? []).map((person) => ({
      text: person.nickname,
      value: person.id,
    }));
  }

  protected unmappedOptions(): { text: string; value: number }[] {
    return (this.data()?.unmappedUsers ?? []).map((user) => ({
      text: `${user.name}${user.email ? ` · ${user.email}` : ''}`,
      value: user.opUserId,
    }));
  }

  protected async save(): Promise<void> {
    if (!this.canEdit()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      let statusMap: Record<string, string> = {};
      let typeMap: Record<string, string> = {};
      try {
        statusMap = JSON.parse(this.statusMapText() || '{}') as Record<string, string>;
        typeMap = JSON.parse(this.typeMapText() || '{}') as Record<string, string>;
      } catch {
        this.error.set('statusMap / typeMap ต้องเป็น JSON object');
        return;
      }
      const current = this.data()?.mapping ?? {};
      const customFields = { ...this.customFields() };
      for (const key of Object.keys(customFields) as CustomFieldKey[]) {
        customFields[key] = customFields[key].trim();
      }
      const mapping = {
        ...current,
        statusMap,
        typeMap,
        customFields: {
          ...((current['customFields'] as Record<string, string> | undefined) ?? {}),
          ...customFields,
        },
      };
      const result = await this.api.saveOpenProject({
        baseUrl: this.baseUrl().trim(),
        token: this.token().trim() || undefined,
        enabled: this.enabled(),
        hoursPerMd: this.hoursPerMd(),
        mapping,
      });
      if (result.errors?.length) {
        this.error.set(result.errors.join('; '));
        return;
      }
      this.token.set('');
      this.data.set(result);
      this.message.set('บันทึกการตั้งค่าแล้ว');
      await this.scorecard.reloadFromApi();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }

  protected async syncNow(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const result = await this.api.syncOpenProject();
      await this.scorecard.reloadFromApi();
      await this.reload();
      this.message.set(
        `ซิงก์เสร็จ · เพิ่ม ${result.added} · อัปเดต ${result.updated} · ไม่เปลี่ยน ${result.unchanged}`,
      );
      if (result.errors.length) {
        this.error.set(result.errors.slice(0, 5).join(' | '));
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'ซิงก์ไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }

  protected async mapUser(): Promise<void> {
    const personId = this.mapPersonId();
    const opUserId = this.mapOpUserId();
    if (!this.canEdit() || !personId || opUserId === null) {
      return;
    }
    this.saving.set(true);
    try {
      const result = await this.api.mapOpenProjectUser(personId, opUserId);
      this.data.set(result);
      this.message.set('จับคู่ผู้ใช้แล้ว');
      this.mapPersonId.set('');
      this.mapOpUserId.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'จับคู่ไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }

  protected async saveGitLabConfig(): Promise<void> {
    if (!this.canEdit()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const projectIds = this.gitlabProjectIdsText()
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const info = await this.api.saveGitLab({
        baseUrl: this.gitlabBaseUrl().trim(),
        projectIds,
        token: this.gitlabToken().trim() || undefined,
        enabled: this.gitlabEnabled(),
      });
      this.gitlabToken.set('');
      this.gitlabData.set(info);
      this.message.set('บันทึกการตั้งค่า GitLab แล้ว');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'บันทึก GitLab ไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }

  protected async syncGitLabNow(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const result = await this.api.syncGitLab();
      if (!result.ok && result.message) {
        this.error.set(result.message);
        return;
      }
      await this.scorecard.reloadFromApi();
      await this.reload();
      const unmatchedCount = result.unmatched?.length ?? 0;
      const errorsList = result.errors ?? [];
      this.message.set(`ซิงก์ GitLab MR เสร็จ · จับคู่ได้ ${result.updated ?? 0} ใบ · ไม่ตรง ${unmatchedCount} รายการ`);
      if (errorsList.length) {
        this.error.set(errorsList.join(' | '));
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'ซิงก์ GitLab ไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }

  protected async saveTeamsConfig(): Promise<void> {
    if (!this.canEdit()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const info = await this.api.saveTeams({
        channel: this.teamsChannel().trim(),
        webhookUrl: this.teamsWebhookUrl().trim() || undefined,
        enabled: this.teamsEnabled(),
      });
      this.teamsWebhookUrl.set('');
      this.teamsData.set(info);
      this.message.set('บันทึกการตั้งค่า Teams Webhook แล้ว');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'บันทึก Teams ไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }

  protected async sendTeamsNow(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const result = await this.api.sendTeams({
        channel: this.teamsChannel(),
        deadline: true,
        overrun: true,
        dryRun: false,
      });
      await this.reload();
      const count = result.messages?.length ?? result.count ?? 0;
      if (!result.ok && result.message) {
        this.error.set(`ส่ง Teams ไม่สำเร็จ: ${result.message}`);
      } else {
        this.message.set(
          result.sent
            ? `ส่งแจ้งเตือนเข้า Teams แล้ว (${count} ข้อความ)`
            : `ร่างข้อความ ${count} รายการ (ยังไม่ได้เปิดส่งจริงหรือไม่มีใบเข้าเกณฑ์)`,
        );
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'ส่ง Teams ไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }

  protected onBaseUrl(event: { value?: string | null }): void {
    this.baseUrl.set(event.value ?? '');
  }

  protected onToken(event: { value?: string | null }): void {
    this.token.set(event.value ?? '');
  }

  protected onHoursPerMd(event: { value?: number | null }): void {
    this.hoursPerMd.set(typeof event.value === 'number' ? event.value : 6);
  }

  protected onStatusMapText(event: { value?: string | null }): void {
    this.statusMapText.set(event.value ?? '');
  }

  protected onTypeMapText(event: { value?: string | null }): void {
    this.typeMapText.set(event.value ?? '');
  }

  protected setCustomField(key: CustomFieldKey, event: { value?: string | null }): void {
    const value = event.value ?? '';
    this.customFields.update((fields) => ({ ...fields, [key]: value }));
  }

  protected onEnabled(event: { checked?: boolean }): void {
    this.enabled.set(!!event.checked);
  }

  protected onPerson(event: { value?: string | null }): void {
    this.mapPersonId.set(event.value ?? '');
  }

  protected onOpUser(event: { value?: number | null }): void {
    this.mapOpUserId.set(event.value ?? null);
  }

  protected runErrors(errors: unknown): string {
    if (Array.isArray(errors)) {
      return errors.map(String).slice(0, 3).join(' · ') || '—';
    }
    return '—';
  }
}

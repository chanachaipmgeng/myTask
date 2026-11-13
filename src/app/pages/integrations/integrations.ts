import { Component, inject, signal } from '@angular/core';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { NumericTextBoxModule, TextAreaModule, TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { GridModule, PageService } from '@syncfusion/ej2-angular-grids';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { ApiClient, OpenProjectIntegration } from '../../core/api-client';
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

@Component({
  selector: 'app-integrations',
  imports: [
    ButtonModule,
    CheckBoxModule,
    DropDownListModule,
    NumericTextBoxModule,
    TextAreaModule,
    TextBoxModule,
    GridModule,
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

  protected baseUrl = '';
  protected token = '';
  protected enabled = true;
  protected hoursPerMd = 6;
  protected statusMapText = '';
  protected typeMapText = '';
  protected customFields: Record<CustomFieldKey, string> = {
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
  protected mapPersonId = '';
  protected mapOpUserId: number | null = null;

  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly workflowHint = WORKFLOW_STATUSES.join(', ');

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const info = await this.api.getOpenProject();
      this.data.set(info);
      this.baseUrl = info.baseUrl;
      this.enabled = info.enabled;
      this.hoursPerMd = info.hoursPerMd;
      this.statusMapText = JSON.stringify(info.mapping['statusMap'] ?? {}, null, 2);
      this.typeMapText = JSON.stringify(info.mapping['typeMap'] ?? {}, null, 2);
      const custom = (info.mapping['customFields'] ?? {}) as Record<string, string>;
      for (const row of this.customFieldRows) {
        this.customFields[row.key] = custom[row.key] ?? '';
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
        statusMap = JSON.parse(this.statusMapText || '{}') as Record<string, string>;
        typeMap = JSON.parse(this.typeMapText || '{}') as Record<string, string>;
      } catch {
        this.error.set('statusMap / typeMap ต้องเป็น JSON object');
        return;
      }
      const current = this.data()?.mapping ?? {};
      const customFields = { ...this.customFields };
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
        baseUrl: this.baseUrl.trim(),
        token: this.token.trim() || undefined,
        enabled: this.enabled,
        hoursPerMd: this.hoursPerMd,
        mapping,
      });
      if (result.errors?.length) {
        this.error.set(result.errors.join('; '));
        return;
      }
      this.token = '';
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
    if (!this.canEdit() || !this.mapPersonId || this.mapOpUserId === null) {
      return;
    }
    this.saving.set(true);
    try {
      const result = await this.api.mapOpenProjectUser(this.mapPersonId, this.mapOpUserId);
      this.data.set(result);
      this.message.set('จับคู่ผู้ใช้แล้ว');
      this.mapPersonId = '';
      this.mapOpUserId = null;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'จับคู่ไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }

  protected onEnabled(event: { checked?: boolean }): void {
    this.enabled = !!event.checked;
  }

  protected onPerson(event: { value?: string | null }): void {
    this.mapPersonId = event.value ?? '';
  }

  protected onOpUser(event: { value?: number | null }): void {
    this.mapOpUserId = event.value ?? null;
  }

  protected runErrors(errors: unknown): string {
    if (Array.isArray(errors)) {
      return errors.map(String).slice(0, 3).join(' · ') || '—';
    }
    return '—';
  }
}

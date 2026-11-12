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
  protected customSize = '';
  protected customTrack = '';
  protected customType = '';
  protected customVariance = '';
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
      this.customSize = custom['size'] ?? '';
      this.customTrack = custom['track'] ?? '';
      this.customType = custom['type'] ?? '';
      this.customVariance = custom['variance'] ?? '';
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
      const mapping = {
        ...current,
        statusMap,
        typeMap,
        customFields: {
          ...((current['customFields'] as Record<string, string> | undefined) ?? {}),
          size: this.customSize.trim(),
          track: this.customTrack.trim(),
          type: this.customType.trim(),
          variance: this.customVariance.trim(),
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

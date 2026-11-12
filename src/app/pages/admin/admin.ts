import { Component, computed, inject, signal } from '@angular/core';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { NumericTextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { SAMPLE_VIEWERS } from '../../data/seed';
import {
  alertRules,
  canEditAdmin,
  connections,
  currentViewer,
  levelOverrides,
  setAlertRules,
  setConnectionState,
  setPersonLevel,
  setTrackWeights,
  setViewer,
  setWeeklyQuota,
  trackWeights,
  weeklyQuotas,
  type ConnectionId,
  type ConnectionState,
} from '../../core/admin-settings';
import { ApiClient } from '../../core/api-client';
import { Level } from '../../core/models';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';

@Component({
  selector: 'app-admin',
  imports: [DropDownListModule, NumericTextBoxModule, CheckBoxModule, ButtonModule, MessageModule],
  templateUrl: './admin.html',
})
export class AdminPage {
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient);

  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly viewers = SAMPLE_VIEWERS;
  protected readonly viewerOptions = SAMPLE_VIEWERS.map((viewer) => ({
    text: `${viewer.nickname} · ${viewer.access === 'lead' ? 'หัวหน้า' : 'สมาชิก'}`,
    value: viewer.id,
  }));
  protected readonly levelOptions = [
    { text: 'Senior', value: 'Senior' },
    { text: 'Mid', value: 'Mid' },
    { text: 'Junior', value: 'Junior' },
    { text: 'เดือนแรก', value: 'FirstMonth' },
  ];
  protected readonly connectionOptions = [
    { text: 'ใช้ไฟล์ตัวอย่าง', value: 'local-fixture' },
    { text: 'API', value: 'api' },
    { text: 'ปิด', value: 'off' },
  ];
  protected readonly levels: readonly Level[] = ['Senior', 'Mid', 'Junior', 'FirstMonth'];
  protected readonly viewer = currentViewer;
  protected readonly session = currentSession;
  protected readonly canEdit = canEditAdmin;
  protected readonly quotas = weeklyQuotas;
  protected readonly rules = alertRules;
  protected readonly links = connections;
  protected readonly roster = this.scorecard.roster;
  protected readonly usingApi = this.scorecard.usingApi;
  protected readonly status = signal('');
  protected readonly accessBanner = computed(() => {
    const parts = [
      this.canEdit() ? 'แก้ได้' : 'ดูได้อย่างเดียว',
      this.usingApi() ? 'ต่อ API' : 'โหมดออฟไลน์ (seed)',
    ];
    const user = this.session();
    if (user) {
      parts.push(`session: ${user.person.nickname} (${user.access})`);
    }
    return parts.join(' · ');
  });
  protected readonly weights = computed(() => {
    const current = trackWeights();
    return {
      implementTicket: current.implement.ticket * 100,
      implementPlan: current.implement.plan * 100,
      implementAccuracy: current.implement.accuracy * 100,
      implementQuality: current.implement.quality * 100,
      researchDod: current.research.dod * 100,
      researchSpike: current.research.spike * 100,
      researchOutcome: current.research.outcome * 100,
      researchReview: current.research.review * 100,
    };
  });

  protected onViewer(event: { value?: string | null }): void {
    if (event.value) {
      setViewer(event.value);
    }
  }

  protected onQuota(level: Level, event: { value?: number | null }): void {
    if (event.value === undefined || event.value === null) {
      return;
    }
    setWeeklyQuota(level, event.value);
    void this.persistSettings();
  }

  protected onLevel(personId: string, event: { value?: string | null }): void {
    if (!event.value || !this.levels.includes(event.value as Level)) {
      return;
    }
    setPersonLevel(personId, event.value as Level);
    void this.persistSettings();
  }

  protected onWeight(key: WeightKey, event: { value?: number | null }): void {
    if (event.value === undefined || event.value === null) {
      return;
    }
    const current = trackWeights();
    const next = {
      implement: { ...current.implement },
      research: { ...current.research },
    };
    const value = event.value / 100;
    if (key.track === 'implement') {
      next.implement[key.part] = value;
    } else {
      next.research[key.part] = value;
    }
    setTrackWeights(next);
    void this.persistSettings();
  }

  protected onDeadline(event: { checked?: boolean }): void {
    setAlertRules({ ...alertRules(), deadline: !!event.checked });
    void this.persistSettings();
  }

  protected onOverrun(event: { checked?: boolean }): void {
    setAlertRules({ ...alertRules(), overrun: !!event.checked });
    void this.persistSettings();
  }

  protected onOverrunLimit(event: { value?: number | null }): void {
    if (event.value === undefined || event.value === null) {
      return;
    }
    setAlertRules({ ...alertRules(), overrunLimit: event.value });
    void this.persistSettings();
  }

  protected onConnection(id: ConnectionId, event: { value?: string | null }): void {
    if (event.value === 'local-fixture' || event.value === 'off' || event.value === 'api') {
      setConnectionState(id, event.value as ConnectionState);
    }
  }

  protected async devLogin(personId: string): Promise<void> {
    try {
      const result = await this.api.devLogin(personId);
      if (!result.ok) {
        this.status.set('dev login ไม่สำเร็จ (ตรวจ AUTH_DEV_LOGIN)');
        return;
      }
      await this.scorecard.reloadFromApi();
      this.status.set(`login เป็น ${result.person?.nickname ?? personId}`);
    } catch {
      this.status.set('dev login ไม่สำเร็จ');
    }
  }

  protected async logout(): Promise<void> {
    try {
      await this.api.logout();
      await this.scorecard.reloadFromApi();
      this.status.set('ออกจากระบบแล้ว');
    } catch {
      this.status.set('logout ไม่สำเร็จ');
    }
  }

  private async persistSettings(): Promise<void> {
    if (!this.canEdit() || !this.usingApi()) {
      return;
    }
    try {
      await this.api.saveSettings({
        weeklyQuotas: weeklyQuotas(),
        trackWeights: trackWeights(),
        alertRules: alertRules(),
        levelOverrides: levelOverrides(),
      });
      this.status.set('บันทึก settings ไปที่เซิร์ฟเวอร์แล้ว');
    } catch {
      this.status.set('บันทึก settings ไม่สำเร็จ');
    }
  }
}

type WeightKey =
  | { track: 'implement'; part: 'ticket' | 'plan' | 'accuracy' | 'quality' }
  | { track: 'research'; part: 'dod' | 'spike' | 'outcome' | 'review' };

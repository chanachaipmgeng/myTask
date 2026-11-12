import { Component, computed, inject } from '@angular/core';
import { CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { NumericTextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { SAMPLE_VIEWERS } from '../../data/seed';
import {
  alertRules,
  canEditAdmin,
  connections,
  currentViewer,
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
import { Level } from '../../core/models';
import { ScorecardService } from '../../core/scorecard.service';

@Component({
  selector: 'app-admin',
  imports: [DropDownListModule, NumericTextBoxModule, CheckBoxModule],
  templateUrl: './admin.html',
})
export class AdminPage {
  private readonly scorecard = inject(ScorecardService);

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
    { text: 'ปิด', value: 'off' },
  ];
  protected readonly levels: readonly Level[] = ['Senior', 'Mid', 'Junior', 'FirstMonth'];
  protected readonly viewer = currentViewer;
  protected readonly canEdit = canEditAdmin;
  protected readonly quotas = weeklyQuotas;
  protected readonly rules = alertRules;
  protected readonly links = connections;
  protected readonly roster = this.scorecard.roster;
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
  }

  protected onLevel(personId: string, event: { value?: string | null }): void {
    if (!event.value || !this.levels.includes(event.value as Level)) {
      return;
    }
    setPersonLevel(personId, event.value as Level);
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
  }

  protected onDeadline(event: { checked?: boolean }): void {
    setAlertRules({ ...alertRules(), deadline: !!event.checked });
  }

  protected onOverrun(event: { checked?: boolean }): void {
    setAlertRules({ ...alertRules(), overrun: !!event.checked });
  }

  protected onOverrunLimit(event: { value?: number | null }): void {
    if (event.value === undefined || event.value === null) {
      return;
    }
    setAlertRules({ ...alertRules(), overrunLimit: event.value });
  }

  protected onConnection(id: ConnectionId, event: { value?: string | null }): void {
    if (event.value === 'local-fixture' || event.value === 'off') {
      setConnectionState(id, event.value as ConnectionState);
    }
  }
}

type WeightKey =
  | { track: 'implement'; part: 'ticket' | 'plan' | 'accuracy' | 'quality' }
  | { track: 'research'; part: 'dod' | 'spike' | 'outcome' | 'review' };

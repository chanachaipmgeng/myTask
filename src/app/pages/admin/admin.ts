import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { CheckBoxSelectionService, DropDownListModule, MultiSelectModule } from '@syncfusion/ej2-angular-dropdowns';
import { GridModule, PageService, ResizeService, SortService } from '@syncfusion/ej2-angular-grids';
import { NumericTextBoxModule, TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { ProgressBarModule } from '@syncfusion/ej2-angular-progressbar';
import { SAMPLE_VIEWERS } from '../../data/seed';
import {
  alertRules,
  canEditAdmin,
  connections,
  currentViewer,
  levelOverrides,
  setAlertRules,
  setConnectionState,
  setPersonAccess,
  setPersonLevel,
  setTrackWeights,
  setViewer,
  setWeeklyQuota,
  trackWeights,
  weeklyQuotas,
  type ConnectionId,
  type ConnectionState,
} from '../../core/admin-settings';
import { ApiClient, AuditLogDto } from '../../core/api-client';
import { AccessRole, Level } from '../../core/models';
import { DEFAULT_TRACK_WEIGHTS } from '../../core/scoring';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { ThemeService } from '../../core/theme.service';
import { beToCe, ceToBe, createYearCycle, type ScorecardCycleStatus } from '../../../../shared/domain/scorecard-cycle';
import { listOrgTeamOptions } from '../../../../shared/domain/workspace-scope';
import { FlashMessagesComponent } from '../../shared/ui/flash-messages/flash-messages';
import { FormFieldComponent } from '../../shared/ui/form-field/form-field';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SectionCardComponent } from '../../shared/ui/section-card/section-card';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge';

@Component({
  selector: 'app-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DropDownListModule,
    MultiSelectModule,
    NumericTextBoxModule,
    TextBoxModule,
    CheckBoxModule,
    ButtonModule,
    GridModule,
    MessageModule,
    ProgressBarModule,
    RouterLink,
    PageHeadComponent,
    SectionCardComponent,
    FormFieldComponent,
    FlashMessagesComponent,
    StatusBadgeComponent,
  ],
  providers: [PageService, SortService, ResizeService, CheckBoxSelectionService],
  templateUrl: './admin.html',
})
export class AdminPage {
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient);
  protected readonly theme = inject(ThemeService);

  protected readonly fields = { text: 'text', value: 'value' };
  protected readonly viewers = SAMPLE_VIEWERS;
  protected readonly viewerOptions = SAMPLE_VIEWERS.map((viewer) => ({
    text: `${viewer.nickname} · ${viewer.access}`,
    value: viewer.id,
  }));
  protected readonly levelOptions = [
    { text: 'Senior', value: 'Senior' },
    { text: 'Mid', value: 'Mid' },
    { text: 'Junior', value: 'Junior' },
    { text: 'เดือนแรก', value: 'FirstMonth' },
  ];
  protected readonly accessOptions = [
    { text: 'Admin (ผู้ดูแลระบบ)', value: 'admin' },
    { text: 'Lead (หัวหน้าสายงาน)', value: 'lead' },
    { text: 'Member (พนักงานทั่วไป)', value: 'member' },
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
  protected readonly personQuery = signal('');
  protected readonly cycles = this.scorecard.cycles;
  protected readonly activeCycleId = this.scorecard.activeCycleId;
  protected readonly cycleBusy = signal(false);
  protected readonly cycleMessage = signal('');
  protected readonly cycleError = signal('');
  private readonly nowBe = ceToBe(new Date().getFullYear());
  protected readonly cycleYearBe = signal(this.nowBe);
  protected readonly cycleLabel = signal(`ปี ${this.nowBe}`);
  protected readonly cycleStartOn = signal(`${beToCe(this.nowBe)}-01-01`);
  protected readonly cycleEndOn = signal(`${beToCe(this.nowBe)}-12-31`);
  protected readonly cycleTeamIds = signal<string[]>([]);
  protected readonly cycleStatus = signal<ScorecardCycleStatus>('open');
  protected readonly cycleStatusOptions = [
    { text: 'เปิด (open)', value: 'open' },
    { text: 'ร่าง (draft)', value: 'draft' },
    { text: 'ปิด (closed)', value: 'closed' },
  ];
  protected readonly cycleTeamOptions = computed(() =>
    listOrgTeamOptions(this.scorecard.people(), this.scorecard.teams()).map((row) => ({
      text: row.label,
      value: row.id,
    })),
  );
  protected readonly auditLogs = signal<AuditLogDto[]>([
    {
      id: 1,
      actorId: 'paweena',
      actorName: 'ปวีณา',
      action: 'system.bootstrap',
      target: 'scorecard',
      detail: 'เริ่มต้นระบบตัวกลางซิงก์และตรวจสอบคะแนนใบงาน',
      createdAt: '2025-10-31T09:00:00Z',
    },
  ]);

  protected readonly filteredRoster = computed(() => {
    const q = this.personQuery().trim().toLowerCase();
    if (!q) {
      return this.roster();
    }
    return this.roster().filter(
      (person) =>
        person.nickname.toLowerCase().includes(q) ||
        person.id.toLowerCase().includes(q) ||
        person.track.toLowerCase().includes(q) ||
        person.level.toLowerCase().includes(q) ||
        (person.access ?? 'member').toLowerCase().includes(q),
    );
  });
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
      implementTicket: Math.round(current.implement.ticket * 100),
      implementPlan: Math.round(current.implement.plan * 100),
      implementAccuracy: Math.round(current.implement.accuracy * 100),
      implementQuality: Math.round(current.implement.quality * 100),
      researchDod: Math.round(current.research.dod * 100),
      researchSpike: Math.round(current.research.spike * 100),
      researchOutcome: Math.round(current.research.outcome * 100),
      researchReview: Math.round(current.research.review * 100),
    };
  });
  protected readonly implementWeightSum = computed(() => {
    const w = this.weights();
    return w.implementTicket + w.implementPlan + w.implementAccuracy + w.implementQuality;
  });
  protected readonly researchWeightSum = computed(() => {
    const w = this.weights();
    return w.researchDod + w.researchSpike + w.researchOutcome + w.researchReview;
  });

  constructor() {
    void this.loadAuditLogs();
  }

  protected onCycleYearBe(event: { value?: number | null }): void {
    const yearBe = Math.trunc(Number(event.value ?? this.nowBe));
    this.cycleYearBe.set(yearBe);
    const yearCe = beToCe(yearBe);
    this.cycleLabel.set(`ปี ${yearBe}`);
    this.cycleStartOn.set(`${yearCe}-01-01`);
    this.cycleEndOn.set(`${yearCe}-12-31`);
  }

  protected onCycleLabel(event: { value?: string | null }): void {
    this.cycleLabel.set(event.value ?? '');
  }

  protected onCycleStart(event: Event): void {
    this.cycleStartOn.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  protected onCycleEnd(event: Event): void {
    this.cycleEndOn.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  protected onCycleTeams(event: { value?: string[] | null }): void {
    this.cycleTeamIds.set([...(event.value ?? [])]);
  }

  protected onCycleStatus(event: { value?: string | null }): void {
    const value = event.value;
    if (value === 'open' || value === 'draft' || value === 'closed') {
      this.cycleStatus.set(value);
    }
  }

  protected async reloadCycles(): Promise<void> {
    this.cycleError.set('');
    try {
      await this.scorecard.reloadFromApi();
      this.cycleMessage.set('รีเฟรชรอบจากเซิร์ฟเวอร์แล้ว');
    } catch (err) {
      this.cycleError.set(err instanceof Error ? err.message : 'รีเฟรชรอบไม่สำเร็จ');
    }
  }

  protected async createCycle(): Promise<void> {
    if (!this.canEdit()) {
      return;
    }
    this.cycleBusy.set(true);
    this.cycleError.set('');
    this.cycleMessage.set('');
    try {
      const draft = createYearCycle({
        yearBe: this.cycleYearBe(),
        label: this.cycleLabel(),
        teamIds: this.cycleTeamIds(),
        status: this.cycleStatus(),
      });
      const result = await this.api.createScorecardCycle({
        yearBe: this.cycleYearBe(),
        label: this.cycleLabel() || draft.label,
        startOn: this.cycleStartOn(),
        endOn: this.cycleEndOn(),
        teamIds: this.cycleTeamIds(),
        status: this.cycleStatus(),
        activate: true,
      });
      if (!result.ok) {
        this.cycleError.set(result.message ?? 'เปิดรอบไม่สำเร็จ');
        return;
      }
      await this.scorecard.reloadFromApi();
      this.cycleMessage.set(`เปิดรอบ ${result.cycle?.label ?? ''} แล้ว และตั้งเป็นรอบระบบ`);
    } catch (err) {
      this.cycleError.set(err instanceof Error ? err.message : 'เปิดรอบไม่สำเร็จ');
    } finally {
      this.cycleBusy.set(false);
    }
  }

  protected async activateCycle(id: string): Promise<void> {
    if (!this.canEdit()) {
      return;
    }
    this.cycleBusy.set(true);
    this.cycleError.set('');
    try {
      const result = await this.api.activateScorecardCycle(id);
      if (!result.ok) {
        this.cycleError.set(result.message ?? 'เปิดเป็นรอบระบบไม่สำเร็จ');
        return;
      }
      await this.scorecard.reloadFromApi();
      this.cycleMessage.set('ตั้งเป็นรอบระบบแล้ว — กด «ใช้รอบระบบ» บนแถบฟิลเตอร์เพื่อกรองทันที');
    } catch (err) {
      this.cycleError.set(err instanceof Error ? err.message : 'เปิดเป็นรอบระบบไม่สำเร็จ');
    } finally {
      this.cycleBusy.set(false);
    }
  }

  protected async deleteCycle(id: string): Promise<void> {
    if (!this.canEdit()) {
      return;
    }
    this.cycleBusy.set(true);
    this.cycleError.set('');
    try {
      const result = await this.api.deleteScorecardCycle(id);
      if (!result.ok) {
        this.cycleError.set(result.message ?? 'ลบรอบไม่สำเร็จ');
        return;
      }
      await this.scorecard.reloadFromApi();
      this.cycleMessage.set('ลบรอบแล้ว');
    } catch (err) {
      this.cycleError.set(err instanceof Error ? err.message : 'ลบรอบไม่สำเร็จ');
    } finally {
      this.cycleBusy.set(false);
    }
  }

  protected async loadAuditLogs(): Promise<void> {
    if (!this.usingApi()) {
      return;
    }
    try {
      const res = await this.api.getAuditLogs();
      if (res.logs.length > 0) {
        this.auditLogs.set(res.logs);
      }
    } catch {
      // Keep local audit logs
    }
  }

  protected resetWeights(): void {
    if (!this.canEdit()) {
      return;
    }
    setTrackWeights(DEFAULT_TRACK_WEIGHTS);
    void this.persistSettings();
  }

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
    this.appendLocalAudit('person.update_level', personId, `level=${event.value}`);
    void this.persistSettings();
  }

  protected async onAccess(personId: string, event: { value?: string | null }): Promise<void> {
    const val = event.value;
    if (val !== 'admin' && val !== 'lead' && val !== 'member') {
      return;
    }
    if (!setPersonAccess(personId, val)) {
      return;
    }
    this.appendLocalAudit('person.update_access', personId, `access=${val}`);
    this.status.set(`อัปเดตสิทธิ์ของ ${personId} เป็น ${val} แล้ว`);
    if (this.usingApi()) {
      try {
        await this.api.updatePersonAccess(personId, { access: val });
        await this.loadAuditLogs();
      } catch {
        // Keep local override
      }
    }
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
    setViewer(personId);
    this.appendLocalAudit('auth.login', personId, 'switch account');
    if (!this.usingApi()) {
      this.status.set(`สลับผู้ใช้งานเป็น ${personId} แล้ว`);
      return;
    }
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

  private appendLocalAudit(action: string, target: string, detail: string): void {
    this.auditLogs.update((current) => [
      {
        id: (current[0]?.id ?? 0) + 1,
        actorId: this.viewer().id,
        actorName: this.viewer().nickname,
        action,
        target,
        detail,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
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

import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
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
import { AccessRole, Level, Person, normalizeTrack } from '../../core/models';
import { ShellNotice } from '../../core/shell-notice';
import { DEFAULT_TRACK_WEIGHTS } from '../../core/scoring';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession } from '../../core/session';
import { ThemeService } from '../../core/theme.service';
import { beToCe, ceToBe, createYearCycle, type ScorecardCycleStatus } from '../../../../shared/domain/scorecard-cycle';
import { TeamVisibilityRule } from '../../../../shared/domain/team-visibility';
import { resolvePersonTeamId } from '../../../../shared/domain/work-views';
import { listOrgTeamOptions, listWorkspaceTrackChipOptions } from '../../../../shared/domain/workspace-scope';
import {
  DateTimePipe,
  FlashMessagesComponent,
  FormFieldComponent,
  PageHeadComponent,
  PersonAvatarComponent,
  SectionCardComponent,
  SfCheckboxComponent,
  SfDatePickerComponent,
  SfDropdownComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
  SfMessageComponent,
  SfMultiSelectComponent,
  SfNumberComponent,
  SfProgressComponent,
  SfTextBoxComponent,
  StatusBadgeComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    RouterLink,
    DateTimePipe,
    PageHeadComponent,
    PersonAvatarComponent,
    SectionCardComponent,
    FormFieldComponent,
    FlashMessagesComponent,
    StatusBadgeComponent,
    SfCheckboxComponent,
    SfDatePickerComponent,
    SfDropdownComponent,
    SfGridComponent,
    SfMessageComponent,
    SfMultiSelectComponent,
    SfNumberComponent,
    SfProgressComponent,
    SfTextBoxComponent,
  ],
  templateUrl: './admin.html',
})
export class AdminPage {
  protected readonly Math = Math;
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient);
  private readonly notice = inject(ShellNotice);
  protected readonly theme = inject(ThemeService);

  protected readonly auditColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'ID', width: 80, textAlign: 'Right' },
    { field: 'actorName', headerText: 'ผู้ดำเนินการ', width: 130 },
    { field: 'action', headerText: 'การกระทำ', width: 180 },
    { field: 'target', headerText: 'เป้าหมาย', width: 140 },
    { field: 'detail', headerText: 'รายละเอียด', width: 280 },
    { field: 'createdAt', headerText: 'เวลา', width: 190 },
  ];
  protected readonly auditGridOptions: SfGridOptions = listGridOptions({
    id: 'admin-audit-grid',
    height: '260',
    excelExport: true,
    exportFileName: 'admin-audit-log',
  });

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

  protected readonly rosterViewMode = signal<'grid' | 'card'>('grid');
  protected readonly rosterCardPage = signal(1);
  protected readonly rosterCardPageSize = 12;

  protected readonly rosterGridColumns: SfGridColumn[] = [
    { field: 'nickname', headerText: 'พนักงาน', width: 200 },
    { field: 'role', headerText: 'ตำแหน่ง / อีเมล', width: 180 },
    { field: 'track', headerText: 'สายงาน', width: 100, textAlign: 'Center' },
    { field: 'access', headerText: 'สิทธิ์', width: 140 },
    { field: 'level', headerText: 'ระดับ', width: 130 },
    { field: 'allowedTeams', headerText: 'ทีมที่มองเห็นได้ (Allowed Teams)', width: 230 },
  ];

  protected readonly visibilityMessage = signal('');
  protected readonly visibilityError = signal('');
  protected readonly visibilityBusy = signal(false);
  protected readonly matrixRules = signal<TeamVisibilityRule[]>([]);
  private readonly matrixInitialized = signal(false);

  protected readonly orgTeams = computed(() =>
    listOrgTeamOptions(this.scorecard.people(), this.scorecard.teams()),
  );

  protected readonly teamSelectOptions = computed(() =>
    this.orgTeams().map((t) => ({ text: t.label, value: t.id })),
  );

  protected rosterAllowedTeams(person: Person): string[] {
    return person.allowedTeams ?? this.scorecard.visibility().userOverrides[person.id] ?? [];
  }

  protected async onAllowedTeams(personId: string, teams: string[]): Promise<void> {
    if (!this.canEdit()) return;
    const ok = await this.scorecard.updateUserAllowedTeams(personId, teams ?? []);
    if (ok) {
      this.notice.success('อัปเดตสิทธิ์การมองเห็นทีมสำเร็จ');
    }
  }

  protected isTeamSharing(sourceId: string, targetId: string): boolean {
    const rules = this.matrixRules();
    return rules.some((r) => r.sourceTeamId === sourceId && r.targetTeamId === targetId);
  }

  protected toggleTeamSharing(sourceId: string, targetId: string, checked: boolean): void {
    if (!this.canEdit()) return;
    this.matrixRules.update((current) => {
      if (checked) {
        if (!current.some((r) => r.sourceTeamId === sourceId && r.targetTeamId === targetId)) {
          return [...current, { sourceTeamId: sourceId, targetTeamId: targetId }];
        }
        return current;
      } else {
        return current.filter((r) => !(r.sourceTeamId === sourceId && r.targetTeamId === targetId));
      }
    });
  }

  protected async saveTeamMatrix(): Promise<void> {
    if (!this.canEdit()) return;
    this.visibilityBusy.set(true);
    this.visibilityError.set('');
    this.visibilityMessage.set('');
    try {
      const ok = await this.scorecard.updateVisibilityMatrix(this.matrixRules());
      if (ok) {
        this.visibilityMessage.set('บันทึกเมทริกซ์การแชร์ทีมเรียบร้อยแล้ว');
        this.notice.success('บันทึกเมทริกซ์การแชร์ทีมสำเร็จ');
      } else {
        this.visibilityError.set('บันทึกไม่สำเร็จ');
      }
    } catch (err) {
      this.visibilityError.set(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      this.visibilityBusy.set(false);
    }
  }

  protected readonly rosterGridOptions: SfGridOptions = listGridOptions({
    id: 'admin-roster-grid-v1',
    excelExport: true,
    csvExport: true,
    exportFileName: 'team-roster-roles',
  });

  protected readonly pagedRosterCards = computed(() => {
    const all = this.filteredRoster();
    const page = this.rosterCardPage();
    const start = (page - 1) * this.rosterCardPageSize;
    return all.slice(start, start + this.rosterCardPageSize);
  });

  protected readonly totalCardPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredRoster().length / this.rosterCardPageSize))
  );

  protected setCardPage(page: number): void {
    if (page >= 1 && page <= this.totalCardPages()) {
      this.rosterCardPage.set(page);
    }
  }

  protected readonly rosterTeamFilter = signal('');
  protected readonly rosterTrackFilter = signal('All');
  protected readonly rosterRoleFilter = signal('');

  protected readonly rosterTeamFilterOptions = computed(() => [
    { text: 'ทุกแผนก / ทีม', value: '' },
    ...this.orgTeams().map((t) => ({ text: t.label, value: t.id })),
  ]);

  protected readonly rosterTrackFilterOptions = computed(() =>
    listWorkspaceTrackChipOptions(this.scorecard.people(), this.scorecard.tickets()).map((row) => ({
      text: row.id === 'All' ? 'ทุกสายงาน' : row.label,
      value: row.id,
    })),
  );

  protected readonly rosterRoleFilterOptions = [
    { text: 'ทุกสิทธิ์ (Role)', value: '' },
    { text: 'Admin (ผู้ดูแลระบบ)', value: 'admin' },
    { text: 'Lead (หัวหน้าทีม)', value: 'lead' },
    { text: 'Member (พนักงาน)', value: 'member' },
  ];

  protected readonly hasRosterFilter = computed(
    () =>
      !!this.personQuery().trim() ||
      !!this.rosterTeamFilter() ||
      this.rosterTrackFilter() !== 'All' ||
      !!this.rosterRoleFilter(),
  );

  protected onPersonQuery(value: string): void {
    this.personQuery.set(value ?? '');
    this.rosterCardPage.set(1);
  }

  protected onRosterTeamFilter(value: string): void {
    this.rosterTeamFilter.set(value ?? '');
    this.rosterCardPage.set(1);
  }

  protected onRosterTrackFilter(value: string): void {
    this.rosterTrackFilter.set(value || 'All');
    this.rosterCardPage.set(1);
  }

  protected onRosterRoleFilter(value: string): void {
    this.rosterRoleFilter.set(value ?? '');
    this.rosterCardPage.set(1);
  }

  protected clearRosterFilters(): void {
    this.personQuery.set('');
    this.rosterTeamFilter.set('');
    this.rosterTrackFilter.set('All');
    this.rosterRoleFilter.set('');
    this.rosterCardPage.set(1);
  }

  protected readonly filteredRoster = computed(() => {
    const q = this.personQuery().trim().toLowerCase();
    const team = this.rosterTeamFilter();
    const track = this.rosterTrackFilter();
    const role = this.rosterRoleFilter();
    return this.roster().filter((person) => {
      if (team && resolvePersonTeamId(person) !== team) return false;
      if (track !== 'All' && normalizeTrack(person.track) !== normalizeTrack(track)) return false;
      const access = person.access ?? 'member';
      if (role && access !== role) return false;
      if (!q) return true;
      return (
        person.nickname.toLowerCase().includes(q) ||
        (person.fullName ?? '').toLowerCase().includes(q) ||
        person.id.toLowerCase().includes(q) ||
        (person.email ?? '').toLowerCase().includes(q) ||
        (person.role ?? '').toLowerCase().includes(q) ||
        (person.jobTitle ?? '').toLowerCase().includes(q) ||
        (person.department ?? '').toLowerCase().includes(q) ||
        person.track.toLowerCase().includes(q) ||
        person.level.toLowerCase().includes(q) ||
        access.toLowerCase().includes(q)
      );
    });
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
    effect(() => {
      const v = this.scorecard.visibility();
      if (!this.matrixInitialized() && v.matrix) {
        this.matrixRules.set([...v.matrix]);
        this.matrixInitialized.set(true);
      }
    });
  }

  protected onCycleYearBe(value: number): void {
    const yearBe = Math.trunc(Number(value || this.nowBe));
    this.cycleYearBe.set(yearBe);
    const yearCe = beToCe(yearBe);
    this.cycleLabel.set(`ปี ${yearBe}`);
    this.cycleStartOn.set(`${yearCe}-01-01`);
    this.cycleEndOn.set(`${yearCe}-12-31`);
  }

  protected onCycleLabel(value: string): void {
    this.cycleLabel.set(value ?? '');
  }

  protected onCycleStart(iso: string): void {
    this.cycleStartOn.set(iso ?? '');
  }

  protected onCycleEnd(iso: string): void {
    this.cycleEndOn.set(iso ?? '');
  }

  protected onCycleTeams(values: string[]): void {
    this.cycleTeamIds.set([...(values ?? [])]);
  }

  protected onCycleStatus(value: string): void {
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
      const res = await this.api.getAuditLogs({ page: 1, pageSize: 100, sort: 'id', dir: 'desc' });
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

  protected onViewer(value: string): void {
    if (value) {
      setViewer(value);
    }
  }

  protected onQuota(level: Level, value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    setWeeklyQuota(level, value);
    void this.persistSettings();
  }

  protected onLevel(personId: string, value: string): void {
    if (!value || !this.levels.includes(value as Level)) {
      return;
    }
    setPersonLevel(personId, value as Level);
    this.appendLocalAudit('person.update_level', personId, `level=${value}`);
    void this.persistSettings();
  }

  protected async onAccess(personId: string, val: string): Promise<void> {
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

  protected onWeight(key: WeightKey, raw: number): void {
    if (!Number.isFinite(raw)) {
      return;
    }
    const current = trackWeights();
    const next = {
      implement: { ...current.implement },
      research: { ...current.research },
    };
    const value = raw / 100;
    if (key.track === 'implement') {
      next.implement[key.part] = value;
    } else {
      next.research[key.part] = value;
    }
    setTrackWeights(next);
    void this.persistSettings();
  }

  protected onDeadline(checked: boolean): void {
    setAlertRules({ ...alertRules(), deadline: !!checked });
    void this.persistSettings();
  }

  protected onOverrun(checked: boolean): void {
    setAlertRules({ ...alertRules(), overrun: !!checked });
    void this.persistSettings();
  }

  protected onOverrunLimit(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    setAlertRules({ ...alertRules(), overrunLimit: value });
    void this.persistSettings();
  }

  protected onConnection(id: ConnectionId, value: string): void {
    if (value === 'local-fixture' || value === 'off' || value === 'api') {
      setConnectionState(id, value as ConnectionState);
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

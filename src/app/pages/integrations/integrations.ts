import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  ApiClient,
  DiscoveredOpCustomFieldDto,
  GitLabIntegration,
  OpenProjectGroupCatalogEntry,
  OpenProjectIntegration,
  OpenProjectSyncAudit,
  TeamsIntegration,
} from '../../core/api-client';
import { canEditAdmin } from '../../core/admin-settings';
import { ScorecardService } from '../../core/scorecard.service';
import { ShellNotice } from '../../core/shell-notice';
import { TicketType, WORKFLOW_STATUSES } from '../../core/models';
import {
  AutoSlaConfig,
  DEFAULT_AUTO_SLA_CONFIG,
  DEFAULT_AUTO_SLA_DAYS_BY_TYPE,
  DuePriorityKey,
} from '../../../../shared/domain/policy-sla';
import {
  DateTimePipe,
  LoadingSkeletonComponent,
  PageHeadComponent,
  SectionCardComponent,
  SfCheckboxComponent,
  SfDropdownComponent,
  SfGridColumn,
  SfGridComponent,
  SfGridOptions,
  listGridOptions,
  SfMessageComponent,
  SfMultiSelectComponent,
  SfNumberComponent,
  SfTabItem,
  SfTabsComponent,
  SfTextBoxComponent,
} from '../../shared/ui';

type CustomFieldKey =
  | 'receiptDate'
  | 'replyDate'
  | 'alertDate'
  | 'policyDate'
  | 'planDate'
  | 'cfDueDate'
  | 'firstDueOn'
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
  | 'unitTest'
  | 'checkPass'
  | 'inTimeBox'
  | 'childTicketsSized'
  | 'mrLink'
  | 'bugCause'
  | 'pocResult'
  | 'weekOffset'
  | 'baselineDue'
  | 'exceptionTag'
  | 'rdWorkTrack'
  | 'spikeOutcome';

function emptyCustomFields(): Record<CustomFieldKey, string> {
  return {
    receiptDate: '',
    replyDate: '',
    alertDate: '',
    policyDate: '',
    planDate: '',
    cfDueDate: '',
    firstDueOn: '',
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
    unitTest: '',
    checkPass: '',
    inTimeBox: '',
    childTicketsSized: '',
    mrLink: '',
    bugCause: '',
    pocResult: '',
    weekOffset: '',
    baselineDue: '',
    exceptionTag: '',
    rdWorkTrack: '',
    spikeOutcome: '',
  };
}

@Component({
  selector: 'app-integrations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    DateTimePipe,
    PageHeadComponent,
    SectionCardComponent,
    LoadingSkeletonComponent,
    SfCheckboxComponent,
    SfDropdownComponent,
    SfGridComponent,
    SfMessageComponent,
    SfMultiSelectComponent,
    SfNumberComponent,
    SfTabsComponent,
    SfTextBoxComponent,
  ],
  templateUrl: './integrations.html',
})
export class IntegrationsPage {
  private readonly api = inject(ApiClient);
  private readonly scorecard = inject(ScorecardService);
  private readonly notice = inject(ShellNotice);

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
  protected readonly projectsText = signal('');
  protected readonly projectTrackText = signal('{}');
  protected readonly defaultTrack = signal('Implement');
  protected readonly teamStaging = signal<'rd' | 'all'>('all');
  protected readonly projectsEmptyWarning = computed(
    () => !this.projectsText().split(',').map((s) => s.trim()).filter(Boolean).length,
  );
  protected readonly projectCatalog = signal<
    { id: number; identifier: string; name: string; active: boolean }[]
  >([]);
  protected readonly groupCatalog = signal<OpenProjectGroupCatalogEntry[]>([]);
  protected readonly rosterGroupIds = signal<number[]>([]);
  protected readonly syncAudit = signal<OpenProjectSyncAudit | null>(null);
  protected readonly auditLoading = signal(false);
  protected readonly statusMapText = signal('');
  protected readonly typeMapText = signal('');
  protected readonly newStatusKey = signal('');
  protected readonly newStatusValue = signal<string>(WORKFLOW_STATUSES[0]);
  protected readonly customFields = signal<Record<CustomFieldKey, string>>(emptyCustomFields());
  protected readonly discoveredFields = signal<DiscoveredOpCustomFieldDto[]>([]);
  protected readonly useManualFieldInput = signal(false);

  protected readonly groupSelectOptions = computed(() =>
    this.groupCatalog().map((g) => ({
      text: `${g.name} (#${g.id}${g.memberCount != null ? ` · ${g.memberCount} คน` : ''})`,
      value: String(g.id),
    })),
  );

  protected readonly rosterGroupIdStrings = computed(() =>
    this.rosterGroupIds().map((id) => String(id)),
  );

  protected readonly slaCustomFieldRows: { key: CustomFieldKey; label: string; hint: string }[] = [
    { key: 'receiptDate', label: 'Receipt Date (วันรับเรื่อง)', hint: 'เช่น customField43' },
    { key: 'alertDate', label: 'Alert Date (วันเตือนล่วงหน้า)', hint: 'เช่น customField163' },
    { key: 'policyDate', label: 'Policy Date (เส้นตาย Policy SLA)', hint: 'เช่น customField185' },
    { key: 'replyDate', label: 'Reply Date (วันส่งมอบ/ตอบกลับ)', hint: 'เช่น customField44' },
    { key: 'cfDueDate', label: 'Due Date (Custom Field)', hint: 'เช่น customField46' },
    { key: 'planDate', label: 'Plan Date (วันแผนงาน)', hint: 'เช่น customField45' },
    { key: 'firstDueOn', label: 'First Due Override', hint: 'เฉพาะกรณีล็อกแยกจาก Due Date' },
  ];

  protected readonly customFieldRows: { key: CustomFieldKey; label: string; hint: string }[] = [
    ...this.slaCustomFieldRows,
    { key: 'size', label: 'Size', hint: 'XS S M L XL' },
    { key: 'track', label: 'Track', hint: 'Implement · RD · QA · UXBA · SUP · INFRA' },
    { key: 'type', label: 'Type', hint: 'Feature / Bug / Spike …' },
    { key: 'variance', label: 'Variance', hint: 'NONE REQ BLK ENV LEG' },
    { key: 'unplanned', label: 'Unplanned', hint: 'boolean' },
    { key: 'storyPoints', label: 'Story points', hint: '1 2 3 5 8 13' },
    { key: 'discipline', label: 'Discipline', hint: 'FE BE Full-Stack …' },
    { key: 'workCategory', label: 'Work category', hint: 'Feature / BugInternal …' },
    { key: 'reviewRounds', label: 'Review rounds', hint: 'integer ≥ 0' },
    { key: 'blocker', label: 'Blocker', hint: 'boolean' },
    { key: 'dodPassed', label: 'DoD passed', hint: 'boolean' },
    { key: 'unitTest', label: 'Unit Test', hint: 'เช่น customField · อ่านอย่างเดียวใน drawer' },
    { key: 'checkPass', label: 'Check pass / Check score', hint: 'boolean · อ่านอย่างเดียว' },
    { key: 'inTimeBox', label: 'Spike in time-box', hint: 'boolean' },
    { key: 'childTicketsSized', label: 'Children sized', hint: 'boolean' },
    { key: 'mrLink', label: 'MR link', hint: 'URL' },
    { key: 'bugCause', label: 'Bug cause', hint: 'Logic UI API …' },
    { key: 'pocResult', label: 'PoC result', hint: 'Adopted / Dropped …' },
    { key: 'weekOffset', label: 'Week offset', hint: '0 1 2+ ถ้าคำนวณไม่ได้' },
    { key: 'baselineDue', label: 'Baseline Due', hint: 'วันที่ baseline จาก CF' },
    { key: 'exceptionTag', label: 'Exception Tag', hint: 'เช่น BUG / EXCEPTION' },
    { key: 'rdWorkTrack', label: 'RD Work Track', hint: 'แนวงาน R&D จาก CF' },
    { key: 'spikeOutcome', label: 'Spike Outcome', hint: 'ผล Spike / PoC จาก CF' },
  ];

  protected readonly defaultTrackOptions: { text: string; value: string }[] = [
    { text: 'Implement (IMP)', value: 'Implement' },
    { text: 'R&D (RND)', value: 'RD' },
    { text: 'QA', value: 'QA' },
    { text: 'Product / BA / UX (UXBA)', value: 'UXBA' },
    { text: 'Support (SUP)', value: 'SUP' },
    { text: 'Infra / DevOps (INFRA)', value: 'INFRA' },
  ];

  protected readonly generalCustomFieldRows = this.customFieldRows.filter(
    (r) => !this.slaCustomFieldRows.some((s) => s.key === r.key),
  );

  // Auto-SLA state
  protected readonly autoSlaEnabled = signal<boolean>(DEFAULT_AUTO_SLA_CONFIG.enabled);
  protected readonly alertLeadWorkingDays = signal<number>(DEFAULT_AUTO_SLA_CONFIG.alertLeadWorkingDays);
  protected readonly autoSlaDaysByType = signal<Record<TicketType, number>>({
    ...DEFAULT_AUTO_SLA_DAYS_BY_TYPE,
  });
  protected readonly duePriorityPreset = signal<string>(
    DEFAULT_AUTO_SLA_CONFIG.duePriorityChain.join(','),
  );

  protected readonly autoSlaTypeRows: { key: TicketType; label: string; hint: string }[] = [
    { key: 'Bug-Investigate', label: 'Bug-Investigate (วิเคราะห์บั๊ก)', hint: 'แนะนำ 2 วันทำการ' },
    { key: 'Bug-Fix', label: 'Bug-Fix (แก้บั๊ก)', hint: 'แนะนำ 3 วันทำการ' },
    { key: 'Ops', label: 'Ops / Service Request', hint: 'แนะนำ 2 วันทำการ' },
    { key: 'Spike', label: 'Spike / R&D PoC', hint: 'แนะนำ 3 วันทำการ' },
    { key: 'Feature', label: 'Feature (ฟีเจอร์ใหม่)', hint: 'แนะนำ 5 วันทำการ' },
    { key: 'CR', label: 'CR / Customization', hint: 'แนะนำ 5 วันทำการ' },
    { key: 'TechDebt', label: 'TechDebt / Refactor', hint: 'แนะนำ 5 วันทำการ' },
  ];

  protected readonly duePriorityOptions: { text: string; value: string }[] = [
    {
      value: 'dueDate,cfDueDate,policyDate,planDate',
      text: 'มาตรฐาน: Due Date → CF Due Date → Policy Date → Plan Date',
    },
    {
      value: 'policyDate,cfDueDate,dueDate,planDate',
      text: 'ยึด Policy SLA เป็นหลัก: Policy Date → CF Due Date → Due Date → Plan Date',
    },
    {
      value: 'cfDueDate,policyDate,dueDate,planDate',
      text: 'ยึด Custom Due Date ก่อน: CF Due Date → Policy Date → Due Date → Plan Date',
    },
    {
      value: 'dueDate,policyDate,cfDueDate,planDate',
      text: 'Due Date มาตรฐาน → Policy Date → CF Due Date → Plan Date',
    },
  ];
  protected readonly mapPersonId = signal('');
  protected readonly mapOpUserId = signal<number | null>(null);

  // GitLab state
  protected readonly gitlabBaseUrl = signal('');
  protected readonly gitlabProjectIdsText = signal('');
  protected readonly gitlabToken = signal('');
  protected readonly gitlabEnabled = signal(true);
  protected readonly discoveryHint = signal('');

  // Teams state
  protected readonly teamsChannel = signal('scorecard-alerts');
  protected readonly teamsWebhookUrl = signal('');
  protected readonly teamsEnabled = signal(true);

  protected readonly integrationTabs: SfTabItem[] = [
    { id: 'op', header: 'OpenProject (myProject)' },
    { id: 'gitlab', header: 'GitLab (mygit MR)' },
    { id: 'teams', header: 'Microsoft Teams' },
  ];
  protected readonly opRunColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'ID', width: 80 },
    { field: 'status', headerText: 'สถานะ', width: 100 },
    { field: 'started_at', headerText: 'เริ่ม', width: 180 },
    { field: 'added', headerText: 'เพิ่ม', width: 80 },
    { field: 'updated', headerText: 'อัปเดต', width: 80 },
    { field: 'unchanged', headerText: 'ไม่เปลี่ยน', width: 100 },
  ];
  protected readonly gitlabRunColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'ID', width: 80 },
    { field: 'status', headerText: 'สถานะ', width: 100 },
    { field: 'started_at', headerText: 'เริ่ม', width: 180 },
    { field: 'updated', headerText: 'จับคู่ใบงาน', width: 110 },
    { field: 'unchanged', headerText: 'ไม่ตรงรหัส', width: 110 },
  ];
  protected readonly teamsRunColumns: SfGridColumn[] = [
    { field: 'id', headerText: 'ID', width: 80 },
    { field: 'status', headerText: 'สถานะ', width: 100 },
    { field: 'started_at', headerText: 'เวลาส่ง', width: 180 },
    { field: 'added', headerText: 'จำนวนข้อความ', width: 130 },
  ];
  protected readonly runGridOptions: SfGridOptions = listGridOptions({ pageSize: 8 });

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
      this.teamStaging.set(info.teamStaging ?? 'all');
      this.projectCatalog.set(info.projectCatalog ?? []);
      this.groupCatalog.set(info.groupCatalog ?? []);
      this.rosterGroupIds.set(info.rosterGroupIds ?? []);
      if (info.customFieldCatalog?.length) {
        this.discoveredFields.set(info.customFieldCatalog);
      }
      const mappedProjects = Array.isArray(info.mapping['projects'])
        ? (info.mapping['projects'] as string[])
        : [];
      this.projectsText.set(mappedProjects.join(', '));
      this.projectTrackText.set(JSON.stringify(info.mapping['projectTrack'] ?? {}, null, 2));
      this.defaultTrack.set(String(info.mapping['defaultTrack'] ?? 'Implement'));
      this.statusMapText.set(JSON.stringify(info.mapping['statusMap'] ?? {}, null, 2));
      this.typeMapText.set(JSON.stringify(info.mapping['typeMap'] ?? {}, null, 2));
      const custom = (info.mapping['customFields'] ?? {}) as Record<string, string>;
      const next = emptyCustomFields();
      for (const row of this.customFieldRows) {
        next[row.key] = custom[row.key] ?? '';
      }
      this.customFields.set(next);

      const rawAutoSla = (info.mapping['autoSla'] ?? null) as Partial<AutoSlaConfig> | null;
      this.autoSlaEnabled.set(rawAutoSla?.enabled ?? DEFAULT_AUTO_SLA_CONFIG.enabled);
      this.alertLeadWorkingDays.set(
        Number.isFinite(rawAutoSla?.alertLeadWorkingDays)
          ? Number(rawAutoSla!.alertLeadWorkingDays)
          : DEFAULT_AUTO_SLA_CONFIG.alertLeadWorkingDays,
      );
      this.autoSlaDaysByType.set({
        ...DEFAULT_AUTO_SLA_DAYS_BY_TYPE,
        ...(rawAutoSla?.daysByType ?? {}),
      });
      const chain = Array.isArray(rawAutoSla?.duePriorityChain) && rawAutoSla!.duePriorityChain.length > 0
        ? rawAutoSla!.duePriorityChain.join(',')
        : DEFAULT_AUTO_SLA_CONFIG.duePriorityChain.join(',');
      this.duePriorityPreset.set(chain);

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
          ? `เชื่อมต่อได้ · writeback ${info.writeback ? 'เปิด' : 'ปิด'} · staging ${info.teamStaging ?? 'all'}`
          : 'ยังไม่ได้ตั้ง URL/token ของ OpenProject',
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      const isServerDown =
        !raw ||
        raw.includes('500') ||
        raw.includes('Internal server error') ||
        raw.includes('Failed to fetch') ||
        raw.startsWith('{');
      this.error.set(
        isServerDown
          ? 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ API ได้ในขณะนี้ (กำลังทำงานในโหมดออฟไลน์ — เปิด Backend Server เพื่อจัดการการเชื่อมต่อจริง)'
          : raw,
      );
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
      let projectTrack: Record<string, string> = {};
      try {
        statusMap = JSON.parse(this.statusMapText() || '{}') as Record<string, string>;
        typeMap = JSON.parse(this.typeMapText() || '{}') as Record<string, string>;
        projectTrack = JSON.parse(this.projectTrackText() || '{}') as Record<string, string>;
      } catch {
        this.error.set('statusMap / typeMap / projectTrack ต้องเป็น JSON object');
        return;
      }
      const current = this.data()?.mapping ?? {};
      const customFields = { ...this.customFields() };
      for (const key of Object.keys(customFields) as CustomFieldKey[]) {
        customFields[key] = customFields[key].trim();
      }
      const projects = this.projectsText()
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      const duePriorityChain = this.duePriorityPreset()
        .split(',')
        .map((k) => k.trim() as DuePriorityKey)
        .filter((k) => ['dueDate', 'cfDueDate', 'policyDate', 'planDate'].includes(k));
      const autoSla: AutoSlaConfig = {
        enabled: this.autoSlaEnabled(),
        alertLeadWorkingDays: Math.max(0, Math.round(this.alertLeadWorkingDays())),
        daysByType: { ...this.autoSlaDaysByType() },
        duePriorityChain:
          duePriorityChain.length > 0 ? duePriorityChain : [...DEFAULT_AUTO_SLA_CONFIG.duePriorityChain],
      };
      const mapping = {
        ...current,
        projects,
        statusMap,
        typeMap,
        projectTrack,
        defaultTrack: this.defaultTrack(),
        customFields: {
          ...((current['customFields'] as Record<string, string> | undefined) ?? {}),
          ...customFields,
        },
        autoSla,
      };
      const result = await this.api.saveOpenProject({
        baseUrl: this.baseUrl().trim(),
        token: this.token().trim() || undefined,
        enabled: this.enabled(),
        hoursPerMd: this.hoursPerMd(),
        rosterGroupIds: this.rosterGroupIds(),
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

  protected async syncUsersNow(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const result = await this.api.syncOpenProjectUsers();
      await this.scorecard.reloadFromApi();
      await this.reload();
      const rosterNote =
        result.rosterGroupIds && result.rosterGroupIds.length
          ? ` · ในกลุ่ม roster ${result.inGroup ?? 0} คน · เปิด ${result.activated ?? 0} · ปิด ${result.deactivated ?? 0}`
          : '';
      const text = `ซิงค์พนักงาน MyProject สำเร็จ · ทั้งหมด ${result.total} คน · เพิ่มใหม่ ${result.created} คน · อัปเดต/เชื่อมโยง ${result.linked + result.updated} คน${rosterNote}`;
      this.message.set(text);
      this.notice.success(text);
      if (result.errors && result.errors.length) {
        this.error.set(result.errors.slice(0, 3).join(' | '));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ซิงค์พนักงานไม่สำเร็จ';
      this.error.set(msg);
      this.notice.error(msg);
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

  protected async discoverCustomFieldsNow(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const res = await this.api.discoverOpenProjectFields();
      if (!res.ok) {
        this.discoveryHint.set(res.message || 'สแกน Schema จาก myProject ไม่สำเร็จ');
        this.notice.warning(this.discoveryHint());
        return;
      }
      this.discoveredFields.set(res.fields ?? []);
      this.useManualFieldInput.set(false);
      const suggestedEntries = Object.entries(res.suggested ?? {});
      if (suggestedEntries.length > 0) {
        this.customFields.update((prev) => {
          const next = { ...prev };
          for (const [k, v] of suggestedEntries) {
            if (k in next && v) {
              next[k as CustomFieldKey] = v;
            }
          }
          return next;
        });
      }
      const matchedSummary = suggestedEntries.map(([k, v]) => `${k}→${v}`).join(', ');
      this.discoveryHint.set(
        `สแกนพบ Custom Fields ใน myProject ${res.fields.length} รายการ · จับคู่อัตโนมัติ ${suggestedEntries.length} ฟิลด์` +
          (matchedSummary ? ` (${matchedSummary})` : '') +
          ' — กด «บันทึกการตั้งค่า OpenProject» เพื่อยืนยัน',
      );
      this.notice.success(this.discoveryHint(), 'สแกนจับคู่ Custom Fields สำเร็จ');
    } catch (err) {
      this.notice.error(err instanceof Error ? err.message : String(err), 'สแกนฟิลด์ไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }

  protected applyMyHrDefaultSlaFields(): void {
    this.customFields.update((prev) => ({
      ...prev,
      receiptDate: 'customField43',
      replyDate: 'customField44',
      planDate: 'customField45',
      cfDueDate: 'customField46',
      alertDate: 'customField163',
      policyDate: 'customField185',
    }));
    this.notice.info(
      'เติมรหัสมาตรฐาน myProject (customField43/44/45/46/163/185) แล้ว — กดบันทึกเพื่อใช้งาน',
    );
  }

  protected discoveredFieldOptions(currentValue: string): { text: string; value: string }[] {
    const list = this.discoveredFields();
    const opts: { text: string; value: string }[] = [{ text: '— ไม่ใช้งาน (ว่าง) —', value: '' }];
    const seen = new Set<string>(['']);
    for (const f of list) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      opts.push({
        text: `${f.name} (${f.key} · ${f.type})`,
        value: f.key,
      });
    }
    if (currentValue && !seen.has(currentValue)) {
      opts.push({
        text: `${currentValue} (ค่าที่ตั้งไว้)`,
        value: currentValue,
      });
    }
    return opts;
  }

  protected setAutoSlaDaysForType(type: TicketType, value: number): void {
    const days = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 1;
    this.autoSlaDaysByType.update((prev) => ({ ...prev, [type]: days }));
  }

  protected resetAutoSlaDefaults(): void {
    this.autoSlaEnabled.set(DEFAULT_AUTO_SLA_CONFIG.enabled);
    this.alertLeadWorkingDays.set(DEFAULT_AUTO_SLA_CONFIG.alertLeadWorkingDays);
    this.autoSlaDaysByType.set({ ...DEFAULT_AUTO_SLA_DAYS_BY_TYPE });
    this.duePriorityPreset.set(DEFAULT_AUTO_SLA_CONFIG.duePriorityChain.join(','));
    this.notice.info('คืนค่าเริ่มต้น Auto-SLA Policy แล้ว — กดบันทึกเพื่อใช้งาน');
  }

  protected async discoverOpenProject(): Promise<void> {
    this.saving.set(true);
    try {
      const res = await this.api.discoverOpenProject();
      if (res.source !== 'live') {
        this.discoveryHint.set(res.message || 'ยังดึง discovery จาก myProject ไม่ได้ (โหมดออฟไลน์)');
        this.notice.warning(this.discoveryHint());
        return;
      }
      this.projectCatalog.set(
        res.projects.map((p, index) => ({
          id: Number(p.id) || index + 1,
          identifier: p.identifier,
          name: p.name || p.identifier,
          active: p.active,
        })),
      );
      if (res.groups?.length) this.groupCatalog.set(res.groups);
      if (res.rosterGroupIds) this.rosterGroupIds.set(res.rosterGroupIds);
      if (res.customFields?.length) this.discoveredFields.set(res.customFields);
      const statusHints = res.statuses.slice(0, 12).map((s) => s.name).join(', ');
      this.discoveryHint.set(
        `พบโปรเจกต์ ${res.projects.length} · สถานะ ${res.statuses.length} · ประเภท ${res.types.length}` +
          ` · กลุ่ม ${res.groups?.length ?? 0} · Enum ${res.enumerations?.length ?? 0} · CF ${res.customFields?.length ?? 0}` +
          (statusHints ? ` · ตัวอย่างสถานะ: ${statusHints}` : '') +
          ' · catalog ถูกบันทึกแล้ว — เลือก identifier / Groups ด้านล่างแล้วกดบันทึก',
      );
      this.notice.success(this.discoveryHint(), 'ดึงรายการ myProject แล้ว');
    } catch (err) {
      this.notice.error(err instanceof Error ? err.message : String(err), 'Discovery ไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }

  protected useActiveProjectsFromCatalog(): void {
    const ids = this.projectCatalog()
      .filter((p) => p.active && p.identifier)
      .map((p) => p.identifier);
    this.projectsText.set(ids.join(', '));
  }

  protected clearSyncProjects(): void {
    this.projectsText.set('');
  }

  protected onRosterGroupsChange(value: unknown): void {
    const raw = Array.isArray(value) ? value : [];
    this.rosterGroupIds.set(
      raw.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0),
    );
  }

  protected async runSyncAudit(): Promise<void> {
    this.auditLoading.set(true);
    try {
      const audit = await this.api.getOpenProjectSyncAudit();
      this.syncAudit.set(audit);
      if (audit.source !== 'live') {
        this.notice.warning(audit.message || 'ตรวจซิงก์ไม่สำเร็จ');
        return;
      }
      if (audit.groups?.length) {
        this.groupCatalog.set(
          audit.groups.map((g) => ({
            id: g.id,
            name: g.name,
            memberCount: g.memberCount,
          })),
        );
      }
      this.notice.success(
        `Users OP ${audit.users?.opTotal ?? 0} · Active คนในระบบ ${audit.users?.peopleActive ?? 0} · Types unmapped ${audit.types?.unmapped.length ?? 0} · Status unmapped ${audit.statuses?.unmapped.length ?? 0}`,
        'รายงานเทียบซิงก์ myProject',
      );
    } catch (err) {
      this.notice.error(err instanceof Error ? err.message : String(err), 'ตรวจซิงก์ไม่สำเร็จ');
    } finally {
      this.auditLoading.set(false);
    }
  }

  protected async discoverGitLabProjects(): Promise<void> {
    this.saving.set(true);
    try {
      const res = await this.api.listGitLabProjects();
      if (res.source !== 'live' || res.projects.length === 0) {
        this.discoveryHint.set(res.message || 'ยังดึงรายชื่อ repo จาก GitLab ไม่ได้');
        this.notice.warning(this.discoveryHint());
        return;
      }
      const ids = res.projects.map((p) => p.id).join(', ');
      this.gitlabProjectIdsText.set(ids);
      this.discoveryHint.set(`ดึง repo ${res.projects.length} รายการแล้ว — กดบันทึกเพื่อเก็บ Project IDs`);
      this.notice.success(this.discoveryHint(), 'Discovery GitLab');
    } catch (err) {
      this.notice.error(err instanceof Error ? err.message : String(err), 'Discovery GitLab ไม่สำเร็จ');
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
        policySla: true,
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

  protected onBaseUrl(value: string): void {
    this.baseUrl.set(value ?? '');
  }

  protected onToken(value: string): void {
    this.token.set(value ?? '');
  }

  protected onHoursPerMd(value: number): void {
    this.hoursPerMd.set(Number.isFinite(value) ? value : 6);
  }

  protected onStatusMapText(value: string): void {
    this.statusMapText.set(value ?? '');
  }

  protected onTypeMapText(value: string): void {
    this.typeMapText.set(value ?? '');
  }

  protected setCustomField(key: CustomFieldKey, value: string): void {
    this.customFields.update((fields) => ({ ...fields, [key]: value ?? '' }));
  }

  protected onEnabled(checked: boolean): void {
    this.enabled.set(!!checked);
  }

  protected onPerson(value: string): void {
    this.mapPersonId.set(value ?? '');
  }

  protected onOpUser(value: string): void {
    const num = Number(value);
    this.mapOpUserId.set(value && Number.isFinite(num) ? num : null);
  }

  protected runErrors(errors: unknown): string {
    if (Array.isArray(errors)) {
      return errors.map(String).slice(0, 3).join(' · ') || '—';
    }
    return '—';
  }
}

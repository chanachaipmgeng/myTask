import { Injectable, ProviderToken, computed, inject, signal } from '@angular/core';
import {
  SEED_ALLOCATIONS,
  SEED_DISPUTES,
  SEED_LEAVES,
  SEED_PEOPLE,
  SEED_STAGE_LOGS,
  SEED_TICKETS,
} from '../data/seed';
import {
  accessOverrides,
  alertRules,
  applyRemoteSettings,
  teamStagingMode,
  levelOverrides,
  trackWeights,
  weeklyQuotas,
} from './admin-settings';
import { trackHexColor } from '../../../shared/domain/palette';
import { evaluatePolicySla, PolicySlaEvaluation } from '../../../shared/domain/policy-sla';
import { RubricDefinition } from '../../../shared/domain/rubrics';
import { todayInBangkok } from '../../../shared/domain/workflow';
import { collectAlerts } from './alerts';
import { ApiClient } from './api-client';
import { planNewWork } from './capacity';
import { MyGitCommit, MyGitMatch, MyGitSyncResult, MyGitUnmatched } from './mygit-sync';
import { scorePartNotes } from './kpi-meaning';
import {
  Department,
  EmployeeLeave,
  Level,
  Person,
  Team,
  Ticket,
  TicketAllocation,
  TicketDispute,
  TicketStageLog,
  Track,
  VarianceCode,
  normalizeTrack,
} from './models';
import { ScorecardCycle, defaultCycleSettings, normalizeCycleSettings } from '../../../shared/domain/scorecard-cycle';
import { TeamVisibilityRule, VisibilityConfig } from '../../../shared/domain/team-visibility';
import {
  HandoffSlaReport,
  PreflightReport,
  QualityAuditReport,
  ThreeWayTimeReport,
  computeHandoffSlaSummary,
  computeQualityAuditSummary,
  computeThreeWayTimeAudit,
  runPreflightChecklist,
  simulateDisputeImpact,
} from '../../../shared/domain/multi-team';
import { addWorkingDays, applyGanttDateEdit } from './work-views';
import {
  INDEX_TARGET,
  UNPLANNED_TARGET,
  calculateMdMandateShare,
  formatMd,
  formatPercent,
  scorePerson,
  scoreTicket,
} from './scoring';
import { currentSession, setSessionUser } from './session';
import { ShellNotice } from './shell-notice';

function optionalInject<T>(token: ProviderToken<T>): T | null {
  try {
    return inject(token, { optional: true });
  } catch {
    return null;
  }
}

export interface TicketRow {
  id: string;
  track: Track;
  trackLabel: string;
  type: Ticket['type'];
  displayType: string;
  opType?: string;
  opStatus?: string;
  module: string;
  size: Ticket['size'];
  points: number;
  assigneeId: string;
  assignee: string;
  workflowStatus: string;
  estimateMd: number;
  actualMd: number;
  ratioLabel: string;
  weekOffsetLabel: string;
  weekPoints: number | null;
  accuracyPoints: number | null;
  reviewRounds: number;
  blockerLabel: string;
  reviewPoints: number | null;
  reopenCount: number;
  reopenPoints: number | null;
  varianceCode: Ticket['varianceCode'];
  closedLabel: string;
  dodLabel: string;
  spikeLabel: string;
  unplannedLabel: string;
  score: number | null;
  scoreMeaning: string;
  alertLabel: string;
  receiptDateLabel: string;
  alertDateLabel: string;
  policyDateLabel: string;
  replyDateLabel: string;
  policySlaLabel: string;
  policySlaTone: PolicySlaEvaluation['tone'];
  policyAuto: boolean;
  unassigned: boolean;
  note: string;
  closedOnLabel: string;
}

export interface ImportResult {
  added: readonly string[];
  skipped: readonly string[];
}

export interface PersonRow {
  id: string;
  nickname: string;
  role: string;
  personLabel: string;
  level: Level;
  track: Track;
  trackLabel: string;
  quota: number;
  index: number;
  planRawPct: number;
  planLabel: string;
  weighted: number;
  reworkPct: number;
  sidePct: number;
  sideLabel: string;
  color: string;
  target: number;
}

function trackLabel(track: Track): string {
  switch (normalizeTrack(track)) {
    case 'RND':
      return 'R&D';
    case 'IMP':
      return 'Implement';
    case 'QA':
      return 'QA';
    case 'UXBA':
      return 'UX/BA';
    case 'SUP':
      return 'Support';
    case 'INFRA':
      return 'Infra';
  }
}

function yesNo(value: boolean): string {
  return value ? 'ใช่' : 'ไม่';
}

function weekOffsetLabel(offset: number): string {
  if (offset <= 0) {
    return 'ตรงสัปดาห์';
  }
  if (offset === 1) {
    return 'เลื่อน 1';
  }
  return 'เลื่อน 2+';
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) {
    return iso;
  }
  return `${day}/${month}/${year}`;
}

function personById(people: readonly Person[]): Map<string, Person> {
  const map = new Map<string, Person>();
  for (const person of people) {
    map.set(person.id, person);
    if (person.openprojectUserId != null) {
      map.set(`op:${person.openprojectUserId}`, person);
    }
  }
  return map;
}

interface LocalSnapshot {
  people: Person[];
  tickets: Ticket[];
  sequence: number;
}

@Injectable({ providedIn: 'root' })
export class ScorecardService {
  private readonly api = optionalInject(ApiClient);
  private readonly notice = optionalInject(ShellNotice);

  // When running inside Angular with ApiClient, start empty (fail closed).
  // Outside Angular DI (e.g. Node verify-scores.ts script), initialize with seed fixtures.
  private readonly peopleState = signal<Person[]>(
    this.api ? [] : SEED_PEOPLE.map((person) => ({ ...person })),
  );
  private readonly ticketsState = signal<Ticket[]>(
    this.api ? [] : SEED_TICKETS.map((ticket) => ({ ...ticket })),
  );
  private readonly sequence = signal(1);
  private readonly apiOnline = signal(false);
  private readonly readyState = signal(!this.api);
  private readonly bootstrapStateSig = signal<'loading' | 'ready' | 'error'>(
    this.api ? 'loading' : 'ready',
  );
  private readonly bootstrapErrorSig = signal<string | null>(null);
  private readonly ticketsLoadErrorSig = signal<string | null>(null);
  private readonly mockModeState = signal(false);
  private snapshot: LocalSnapshot | null = null;
  private readyPromise: Promise<void> | null = null;
  private reloadInFlight: Promise<boolean> | null = null;
  private resolveReadyWaiters: (() => void)[] = [];

  /** Memo scoreTicket ต่อใบ — ลดงาน computed ระดับรากเมื่อ tickets ไม่เปลี่ยนฟิลด์คะแนน */
  private readonly ticketScoreCache = new Map<string, ReturnType<typeof scoreTicket>>();
  private readonly rubricsMapState = signal<Record<string, RubricDefinition>>({});
  private readonly rubricsVersionState = signal(0);

  private readonly allocationsState = signal<TicketAllocation[]>(
    this.api ? [] : [...SEED_ALLOCATIONS],
  );
  private readonly stageLogsState = signal<TicketStageLog[]>(
    this.api ? [] : [...SEED_STAGE_LOGS],
  );
  private readonly leavesState = signal<EmployeeLeave[]>(this.api ? [] : [...SEED_LEAVES]);
  private readonly disputesState = signal<TicketDispute[]>(this.api ? [] : [...SEED_DISPUTES]);
  private readonly departmentsState = signal<Department[]>([]);
  private readonly teamsState = signal<Team[]>([]);
  private readonly visibilityState = signal<VisibilityConfig>({ matrix: [], userOverrides: {} });
  private readonly effectiveAllowedTeamsState = signal<string[] | null>(null);
  private readonly cyclesState = signal<ScorecardCycle[]>(defaultCycleSettings().cycles);
  private readonly activeCycleIdState = signal<string | null>(defaultCycleSettings().activeCycleId);

  readonly people = computed(() => this.peopleState());
  readonly tickets = this.ticketsState.asReadonly();
  readonly departments = this.departmentsState.asReadonly();
  readonly teams = this.teamsState.asReadonly();
  readonly visibility = this.visibilityState.asReadonly();
  readonly effectiveAllowedTeams = this.effectiveAllowedTeamsState.asReadonly();
  readonly cycles = this.cyclesState.asReadonly();
  readonly activeCycleId = this.activeCycleIdState.asReadonly();
  readonly allocations = this.allocationsState.asReadonly();
  readonly stageLogs = this.stageLogsState.asReadonly();
  readonly leaves = this.leavesState.asReadonly();
  readonly disputes = this.disputesState.asReadonly();
  readonly apiReady = this.readyState.asReadonly();
  readonly bootstrapState = this.bootstrapStateSig.asReadonly();
  readonly bootstrapError = this.bootstrapErrorSig.asReadonly();
  readonly ticketsLoadError = this.ticketsLoadErrorSig.asReadonly();
  readonly usingApi = this.apiOnline.asReadonly();
  readonly mockMode = this.mockModeState.asReadonly();
  readonly activeRubrics = this.rubricsMapState.asReadonly();

  readonly handoffReport = computed<HandoffSlaReport>(() =>
    computeHandoffSlaSummary(this.ticketsState(), this.stageLogsState(), this.roster()),
  );

  readonly qualityAuditReport = computed<QualityAuditReport>(() =>
    computeQualityAuditSummary(this.ticketsState(), this.roster()),
  );

  readonly threeWayTimeReport = computed<ThreeWayTimeReport>(() =>
    computeThreeWayTimeAudit(this.ticketsState(), this.roster()),
  );

  readonly preflightReport = computed<PreflightReport>(() =>
    runPreflightChecklist(this.roster(), this.ticketsState(), this.disputesState(), this.leavesState()),
  );

  readonly mdMandateReport = computed(() => calculateMdMandateShare(this.ticketsState()));

  readonly roster = computed(() =>
    this.peopleState().map((person) => ({
      ...person,
      level: levelOverrides()[person.id] ?? person.level,
      access: accessOverrides()[person.id] ?? person.access ?? 'member',
    })),
  );

  readonly peopleById = computed(() => personById(this.roster()));

  readonly ticketsByAssignee = computed(() => {
    const map = new Map<string, Ticket[]>();
    for (const ticket of this.ticketsState()) {
      const aid = ticket.assigneeId?.trim();
      if (!aid) continue;
      const list = map.get(aid);
      if (list) list.push(ticket);
      else map.set(aid, [ticket]);
    }
    return map;
  });

  readonly ticketRows = computed(() => this.toTicketRows(this.ticketsState(), alertRules()));

  readonly personRows = computed(() =>
    this.toPersonRows(this.roster(), this.ticketsState(), trackWeights(), weeklyQuotas()),
  );

  readonly alerts = computed(() => {
    const rules = alertRules();
    return collectAlerts(this.ticketsState(), rules.overrunLimit).filter((alert) =>
      alert.kind === 'overrun' ? rules.overrun : rules.deadline,
    );
  });

  readonly workPlan = computed(() =>
    planNewWork(this.roster(), this.ticketsState(), weeklyQuotas(), this.leavesState()),
  );

  private readonly devLoginEnabledState = signal(false);
  readonly devLoginEnabled = this.devLoginEnabledState.asReadonly();

  constructor() {
    if (this.api) {
      void this.reloadFromApi();
    } else {
      this.readyState.set(true);
      this.bootstrapStateSig.set('ready');
    }
  }

  clearSessionState(): void {
    setSessionUser(null, null);
    this.peopleState.set([]);
    this.ticketsState.set([]);
    this.departmentsState.set([]);
    this.teamsState.set([]);
    this.disputesState.set([]);
    this.leavesState.set([]);
    this.stageLogsState.set([]);
    this.allocationsState.set([]);
    this.visibilityState.set({ matrix: [], userOverrides: {} });
    this.effectiveAllowedTeamsState.set(null);
    this.ticketScoreCache.clear();
  }

  whenReady(): Promise<void> {
    if (this.readyState()) {
      return Promise.resolve();
    }
    if (!this.readyPromise) {
      this.readyPromise = new Promise<void>((resolve) => {
        this.resolveReadyWaiters.push(resolve);
      });
    }
    return this.readyPromise;
  }

  private markReady(): void {
    this.readyState.set(true);
    const waiters = this.resolveReadyWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
    this.readyPromise = null;
  }

  setRubrics(list: readonly RubricDefinition[]): void {
    const map: Record<string, RubricDefinition> = {};
    for (const r of list) {
      map[r.rubric_id] = r;
    }
    this.rubricsMapState.set(map);
    this.rubricsVersionState.update((v) => v + 1);
    this.ticketScoreCache.clear();
  }

  private rubricOptions(): { rubrics?: Record<string, RubricDefinition> } | undefined {
    const map = this.rubricsMapState();
    return Object.keys(map).length > 0 ? { rubrics: map } : undefined;
  }

  async reloadFromApi(): Promise<boolean> {
    if (this.reloadInFlight) {
      return this.reloadInFlight;
    }
    const run = this.executeReloadFromApi().finally(() => {
      if (this.reloadInFlight === run) {
        this.reloadInFlight = null;
      }
    });
    this.reloadInFlight = run;
    return run;
  }

  private async executeReloadFromApi(): Promise<boolean> {
    if (this.mockModeState()) {
      this.bootstrapStateSig.set('ready');
      this.markReady();
      return false;
    }
    if (!this.api) {
      this.bootstrapStateSig.set('ready');
      this.markReady();
      return false;
    }
    this.bootstrapErrorSig.set(null);
    this.ticketsLoadErrorSig.set(null);
    if (!this.readyState()) {
      this.bootstrapStateSig.set('loading');
    }

    try {
      const data = await this.api.bootstrap();
      if (this.mockModeState()) {
        this.bootstrapStateSig.set('ready');
        this.markReady();
        return false;
      }

      this.devLoginEnabledState.set(data.auth.devLoginEnabled ?? false);
      if (data.teamStaging === 'all' || data.teamStaging === 'rd') {
        teamStagingMode.set(data.teamStaging);
      }

      if (!data.auth.authenticated || !data.auth.person) {
        setSessionUser(null, null);
        this.peopleState.set([]);
        this.ticketsState.set([]);
        this.departmentsState.set([]);
        this.teamsState.set([]);
        this.disputesState.set([]);
        this.leavesState.set([]);
        this.stageLogsState.set([]);
        this.allocationsState.set([]);
        this.effectiveAllowedTeamsState.set(null);
        this.apiOnline.set(true);
        this.bootstrapStateSig.set('ready');
        this.markReady();
        return true;
      }

      this.peopleState.set(data.people.map((person) => ({ ...person })));
      this.departmentsState.set((data.departments ?? []).map((item) => ({ ...item })));
      this.teamsState.set((data.teams ?? []).map((item) => ({ ...item })));
      this.disputesState.set((data.disputes ?? []).map((item) => ({ ...item })));
      this.leavesState.set((data.leaves ?? []).map((item) => ({ ...item })));
      this.stageLogsState.set((data.stageLogs ?? []).map((item) => ({ ...item })));
      this.allocationsState.set((data.allocations ?? []).map((item) => ({ ...item })));
      if (Array.isArray(data.rubrics) && data.rubrics.length > 0) {
        this.setRubrics(data.rubrics);
      }
      if (data.settings) {
        const cycleSettings = normalizeCycleSettings(
          (data.settings as { scorecardCycles?: Parameters<typeof normalizeCycleSettings>[0] })
            ?.scorecardCycles,
        );
        const resolvedCycles =
          cycleSettings.cycles.length > 0 ? cycleSettings : defaultCycleSettings();
        this.cyclesState.set(resolvedCycles.cycles.map((row) => ({ ...row, teamIds: [...row.teamIds] })));
        this.activeCycleIdState.set(resolvedCycles.activeCycleId);
        applyRemoteSettings(data.settings);
      }
      if (data.visibility) {
        this.visibilityState.set(data.visibility);
      }
      this.effectiveAllowedTeamsState.set(data.auth.effectiveAllowedTeams ?? null);
      setSessionUser(data.auth.person, data.auth.access ?? data.auth.person.access ?? 'member');

      this.apiOnline.set(true);
      this.bootstrapStateSig.set('ready');

      // ใบงานแยกโหลด — ไม่บล็อก shell ด้วย SELECT * ทั้งฐาน
      if (data.ticketsDeferred || !data.tickets?.length) {
        this.ticketsState.set([]);
        this.markReady();
        try {
          const ticketPayload = await this.api.bootstrapTickets();
          if (!this.mockModeState()) {
            this.ticketsState.set((ticketPayload.tickets ?? []).map((ticket) => ({ ...ticket })));
            this.ticketScoreCache.clear();
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'โหลดข้อมูลใบงานไม่สำเร็จ';
          this.ticketsLoadErrorSig.set(msg);
          this.notice?.error(msg, 'โหลดรายการใบงานไม่สำเร็จ');
        }
      } else {
        this.ticketsState.set(data.tickets.map((ticket) => ({ ...ticket })));
        this.ticketScoreCache.clear();
        this.markReady();
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ API ได้';
      this.apiOnline.set(false);
      this.bootstrapErrorSig.set(msg);
      this.bootstrapStateSig.set('error');
      this.markReady();
      return false;
    }
  }

  enterMockSandbox(people: readonly Person[], tickets: readonly Ticket[]): void {
    if (!this.mockModeState()) {
      this.snapshot = {
        people: this.peopleState().map((person) => ({ ...person })),
        tickets: this.ticketsState().map((ticket) => ({ ...ticket })),
        sequence: this.sequence(),
      };
    }
    this.mockModeState.set(true);
    this.peopleState.set(people.map((person) => ({ ...person })));
    this.ticketsState.set(tickets.map((ticket) => ({ ...ticket })));
    this.bootstrapStateSig.set('ready');
    this.markReady();
  }

  setMockTickets(tickets: readonly Ticket[]): void {
    if (!this.mockModeState()) {
      return;
    }
    this.ticketsState.set(tickets.map((ticket) => ({ ...ticket })));
  }

  setMockPeople(people: readonly Person[]): void {
    if (!this.mockModeState()) {
      return;
    }
    this.peopleState.set(people.map((person) => ({ ...person })));
  }

  async updateVisibilityMatrix(matrix: TeamVisibilityRule[]): Promise<boolean> {
    if (!this.api) return false;
    try {
      const res = await this.api.updateVisibilityMatrix(matrix);
      if (res.ok) {
        this.visibilityState.update((prev) => ({ ...prev, matrix: res.matrix ?? matrix }));
        return true;
      }
    } catch (err) {
      this.notice?.error(err instanceof Error ? err.message : 'อัปเดตสิทธิ์การมองเห็นทีมไม่สำเร็จ');
    }
    return false;
  }

  async updateUserAllowedTeams(userId: string, allowedTeams: string[]): Promise<boolean> {
    if (!this.api) return false;
    try {
      const res = await this.api.updateUserAllowedTeams(userId, allowedTeams);
      if (res.ok) {
        const clean = res.allowedTeams ?? allowedTeams;
        this.visibilityState.update((prev) => ({
          ...prev,
          userOverrides: { ...prev.userOverrides, [userId]: clean },
        }));
        this.peopleState.update((list) =>
          list.map((p) => (p.id === userId ? { ...p, allowedTeams: clean } : p)),
        );
        return true;
      }
    } catch (err) {
      this.notice?.error(err instanceof Error ? err.message : 'บันทึกสิทธิ์ทีมรายบุคคลไม่สำเร็จ');
    }
    return false;
  }

  exitMockSandbox(): boolean {
    if (!this.mockModeState()) {
      return false;
    }
    const saved = this.snapshot;
    this.snapshot = null;
    this.mockModeState.set(false);
    if (saved) {
      this.peopleState.set(saved.people);
      this.ticketsState.set(saved.tickets);
      this.sequence.set(saved.sequence);
    }
    return true;
  }

  addTicket(input: Omit<Ticket, 'id'>): Ticket {
    const ticket: Ticket = { ...input, id: `T-${String(this.sequence()).padStart(3, '0')}` };
    this.sequence.update((value) => value + 1);
    this.ticketsState.update((current) => [...current, ticket]);
    if (!this.mockModeState() && this.apiOnline() && this.api) {
      void this.api
        .createWorkItem(ticket)
        .then((result) => {
          if (result.ok === false) {
            this.ticketsState.update((current) => current.filter((t) => t.id !== ticket.id));
            this.notice?.error('สร้างใบงานไม่สำเร็จ');
            return;
          }
          if (result.ticket) {
            this.replaceLocal(result.ticket);
          }
        })
        .catch((err) => {
          this.ticketsState.update((current) => current.filter((t) => t.id !== ticket.id));
          this.notice?.error(err instanceof Error ? err.message : 'สร้างใบงานไม่สำเร็จ');
        });
    }
    return ticket;
  }

  importTickets(incoming: readonly Ticket[]): ImportResult {
    const existing = new Set(this.ticketsState().map((ticket) => ticket.id));
    const added: Ticket[] = [];
    const skipped: string[] = [];
    for (const ticket of incoming) {
      if (existing.has(ticket.id)) {
        skipped.push(ticket.id);
        continue;
      }
      existing.add(ticket.id);
      added.push({ ...ticket });
    }
    if (added.length > 0) {
      const addedIds = new Set(added.map((t) => t.id));
      this.ticketsState.update((current) => [...current, ...added]);
      if (!this.mockModeState() && this.apiOnline() && this.api) {
        void this.api
          .importWorkItems(added)
          .then((res) => {
            if (res.ok === false) {
              this.ticketsState.update((current) => current.filter((t) => !addedIds.has(t.id)));
              this.notice?.error('นำเข้าใบงานไม่สำเร็จ');
            }
          })
          .catch((err) => {
            this.ticketsState.update((current) => current.filter((t) => !addedIds.has(t.id)));
            this.notice?.error(err instanceof Error ? err.message : 'นำเข้าใบงานไม่สำเร็จ');
          });
      }
    }
    return { added: added.map((ticket) => ticket.id), skipped };
  }

  replaceTicket(next: Ticket): boolean {
    const previous = this.ticketsState().find((t) => t.id === next.id);
    if (!previous) {
      return false;
    }
    this.replaceLocal({ ...next, id: previous.id });
    if (!this.mockModeState() && this.apiOnline() && this.api) {
      void this.api
        .replaceWorkItem(next)
        .then((res) => {
          if (res.ok === false) {
            this.replaceLocal(previous);
            this.notice?.error('บันทึกใบงานไม่สำเร็จ ระบบคืนค่าเดิมแล้ว');
            return;
          }
          if (res.ticket) {
            this.replaceLocal(res.ticket);
          }
        })
        .catch((err) => {
          this.replaceLocal(previous);
          this.notice?.error(err instanceof Error ? err.message : 'บันทึกใบงานไม่สำเร็จ ระบบคืนค่าเดิมแล้ว');
        });
    }
    return true;
  }

  async assignTicket(
    ticketId: string,
    assigneeId: string,
  ): Promise<{ ok: boolean; writebackError?: string; message?: string }> {
    if (!this.peopleState().some((person) => person.id === assigneeId)) {
      return { ok: false, message: 'ไม่พบผู้รับ' };
    }
    const previous = this.ticketsState().find((ticket) => ticket.id === ticketId);
    if (!previous || previous.assigneeId !== '') {
      return { ok: false, message: 'ใบไม่มีหรือมีผู้รับแล้ว' };
    }

    this.ticketsState.update((current) =>
      current.map((ticket) => (ticket.id === ticketId ? { ...ticket, assigneeId } : ticket)),
    );

    if (this.mockModeState() || !this.apiOnline() || !this.api) {
      return { ok: true };
    }

    try {
      const result = await this.api.assignWorkItem(ticketId, assigneeId);
      if (!result.ok) {
        this.ticketsState.update((current) =>
          current.map((ticket) => (ticket.id === ticketId ? { ...ticket, assigneeId: '' } : ticket)),
        );
        return { ok: false, message: result.message ?? 'แจกงานไม่สำเร็จ' };
      }
      if (result.ticket) {
        this.ticketsState.update((current) =>
          current.map((ticket) => (ticket.id === ticketId ? result.ticket! : ticket)),
        );
      }
      return { ok: true, writebackError: result.writebackError };
    } catch (err) {
      this.ticketsState.update((current) =>
        current.map((ticket) => (ticket.id === ticketId ? { ...ticket, assigneeId: '' } : ticket)),
      );
      return { ok: false, message: err instanceof Error ? err.message : 'แจกงานไม่สำเร็จ' };
    }
  }

  async updateTicketDates(
    ticketId: string,
    dates: { startDate?: string | null; dueDate?: string | null },
  ): Promise<{ ok: boolean; writebackError?: string; message?: string }> {
    const previous = this.ticketsState().find((ticket) => ticket.id === ticketId);
    if (!previous) {
      return { ok: false, message: 'ไม่พบใบงาน' };
    }
    const edited = applyGanttDateEdit(previous, dates);
    if (!edited.ok) {
      return { ok: false, message: edited.message };
    }
    this.ticketsState.update((current) =>
      current.map((ticket) => (ticket.id === ticketId ? edited.ticket : ticket)),
    );
    if (this.mockModeState() || !this.apiOnline() || !this.api) {
      return { ok: true };
    }
    try {
      const result = await this.api.updateWorkItemDates(ticketId, dates);
      if (!result.ok) {
        this.ticketsState.update((current) =>
          current.map((ticket) => (ticket.id === ticketId ? previous : ticket)),
        );
        return { ok: false, message: result.message ?? 'บันทึกวันที่ไม่สำเร็จ' };
      }
      if (result.ticket) {
        this.ticketsState.update((current) =>
          current.map((ticket) => (ticket.id === ticketId ? result.ticket! : ticket)),
        );
      }
      return { ok: true, writebackError: result.writebackError };
    } catch (err) {
      this.ticketsState.update((current) =>
        current.map((ticket) => (ticket.id === ticketId ? previous : ticket)),
      );
      return { ok: false, message: err instanceof Error ? err.message : 'บันทึกวันที่ไม่สำเร็จ' };
    }
  }

  applyMyGit(commits: readonly (MyGitCommit & { mrLink?: string })[]): MyGitSyncResult {
    const byId = new Map(this.ticketsState().map((ticket) => [ticket.id, ticket]));
    const pending = new Map<string, { reviewRounds: number; reopenCount: number; mrLink?: string }>();
    const matched: MyGitMatch[] = [];
    const unmatched: MyGitUnmatched[] = [];
    const rubricOpts = this.rubricOptions();

    for (const commit of commits) {
      const ticket = commit.ticketId ? byId.get(commit.ticketId) : undefined;
      if (!ticket) {
        unmatched.push({
          sha: commit.sha,
          message: commit.message,
          mergedAt: commit.mergedAt,
          ticketId: commit.ticketId,
        });
        continue;
      }
      const reviewBefore = scoreTicket(ticket, rubricOpts).review;
      pending.set(ticket.id, {
        reviewRounds: commit.reviewRounds,
        reopenCount: commit.reopenCount,
        mrLink: commit.mrLink,
      });
      const reviewAfter = scoreTicket(
        {
          ...ticket,
          reviewRounds: commit.reviewRounds,
          reopenCount: commit.reopenCount,
        },
        rubricOpts,
      ).review;
      matched.push({
        sha: commit.sha,
        message: commit.message,
        mergedAt: commit.mergedAt,
        ticketId: ticket.id,
        reviewRounds: commit.reviewRounds,
        reopenCount: commit.reopenCount,
        reviewBefore,
        reviewAfter,
        mrLink: commit.mrLink || ticket.mrLink,
      });
    }

    if (pending.size > 0) {
      const updatedList: Ticket[] = [];
      this.ticketsState.update((current) =>
        current.map((ticket) => {
          const update = pending.get(ticket.id);
          if (!update) {
            return ticket;
          }
          const next = {
            ...ticket,
            reviewRounds: update.reviewRounds,
            reopenCount: update.reopenCount,
            mrLink: update.mrLink || ticket.mrLink,
          };
          updatedList.push(next);
          return next;
        }),
      );
      if (!this.mockModeState() && this.apiOnline() && this.api && updatedList.length > 0) {
        void (async () => {
          let failed = 0;
          for (const next of updatedList) {
            try {
              const res = await this.api!.replaceWorkItem(next);
              if (res.ok === false) failed++;
            } catch {
              failed++;
            }
          }
          if (failed > 0) {
            this.notice?.error(`อัปเดตข้อมูล GitLab กลับเซิร์ฟเวอร์ไม่สำเร็จ ${failed} รายการ`);
          }
        })();
      }
    }
    return { matched, unmatched };
  }

  updatePersonLocal(next: Person): void {
    this.peopleState.update((current) =>
      current.map((person) => (person.id === next.id ? { ...person, ...next } : person)),
    );
  }

  private replaceLocal(next: Ticket): void {
    this.ticketsState.update((current) => {
      const index = current.findIndex((ticket) => ticket.id === next.id);
      if (index < 0) {
        return [...current, next];
      }
      const copy = current.slice();
      copy[index] = next;
      return copy;
    });
  }

  /** สร้างแถวคะแนนจากชุดใบงาน (ใช้กับ remote page) */
  mapTicketsToRows(tickets: readonly Ticket[]): TicketRow[] {
    return this.toTicketRows(tickets, alertRules());
  }

  private scoreTicketCached(ticket: Ticket): ReturnType<typeof scoreTicket> {
    const pausedTriState = ticket.isPaused === true ? 1 : ticket.isPaused === false ? 0 : 2;
    const key = [
      ticket.id,
      ticket.track,
      ticket.closed ? 1 : 0,
      ticket.closedOn ?? '',
      ticket.dodPassed ? 1 : 0,
      ticket.size,
      ticket.type,
      ticket.estimateMd,
      ticket.actualMd,
      ticket.reviewRounds,
      ticket.reopenCount,
      ticket.weekOffset,
      ticket.firstDueOn ?? '',
      ticket.readyForQaAt ?? '',
      ticket.devDeliveredOn ?? '',
      ticket.replyDate ?? '',
      ticket.blocker ? 1 : 0,
      ticket.pausedDays ?? 0,
      pausedTriState,
      ticket.varianceCode,
      ticket.inTimeBox ? 1 : 0,
      ticket.childTicketsSized ? 1 : 0,
      this.rubricsVersionState(),
    ].join('|');
    const hit = this.ticketScoreCache.get(key);
    if (hit) return hit;
    const score = scoreTicket(ticket, this.rubricOptions());
    if (this.ticketScoreCache.size > 20_000) this.ticketScoreCache.clear();
    this.ticketScoreCache.set(key, score);
    return score;
  }

  private toTicketRows(
    tickets: readonly Ticket[],
    rules: { deadline: boolean; overrun: boolean; overrunLimit: number },
  ): TicketRow[] {
    const people = personById(this.peopleState());
    const today = todayInBangkok();
    return tickets.map((ticket) => {
      const score = this.scoreTicketCached(ticket);
      const person = ticket.assigneeId ? people.get(ticket.assigneeId) : undefined;
      const scored = score.total !== null;
      const alerts = collectAlerts([ticket], rules.overrunLimit, today).filter((alert) =>
        alert.kind === 'overrun' ? rules.overrun : rules.deadline,
      );
      const sla = evaluatePolicySla(ticket, today);
      return {
        id: ticket.id,
        track: ticket.track,
        trackLabel: trackLabel(ticket.track),
        type: ticket.type,
        displayType: ticket.opType?.trim() || ticket.type,
        opType: ticket.opType,
        opStatus: ticket.opStatus,
        module: ticket.module,
        size: ticket.size,
        points: score.points,
        assigneeId: ticket.assigneeId,
        assignee: person ? `${person.nickname} · ${person.role}` : ticket.assigneeId ? ticket.assigneeId : 'ยังไม่มีผู้รับ',
        workflowStatus: ticket.workflowStatus ?? (ticket.closed ? 'Done' : 'In Progress'),
        estimateMd: ticket.estimateMd,
        actualMd: ticket.actualMd,
        ratioLabel: score.ratio === null ? '—' : formatPercent(score.ratio, 2),
        weekOffsetLabel: weekOffsetLabel(ticket.weekOffset),
        weekPoints: scored ? score.week : null,
        accuracyPoints: scored ? score.accuracy : null,
        reviewRounds: ticket.reviewRounds,
        blockerLabel: yesNo(ticket.blocker),
        reviewPoints: scored ? score.review : null,
        reopenCount: ticket.reopenCount,
        reopenPoints: scored ? score.reopen : null,
        varianceCode: ticket.varianceCode,
        closedLabel: yesNo(ticket.closed),
        dodLabel: yesNo(ticket.dodPassed),
        spikeLabel: score.spikeScore === null ? '—' : String(score.spikeScore),
        unplannedLabel: yesNo(ticket.unplanned),
        score: score.total,
        scoreMeaning: scorePartNotes(score),
        alertLabel: alerts.length > 0 ? alerts.map((alert) => alert.shortLabel).join(', ') : '—',
        receiptDateLabel: formatDate(ticket.receiptDate ?? null),
        alertDateLabel: formatDate(ticket.alertDate ?? null),
        policyDateLabel: formatDate(ticket.policyDate ?? null),
        replyDateLabel: formatDate(ticket.replyDate ?? ticket.devDeliveredOn ?? null),
        policySlaLabel: sla.shortLabel,
        policySlaTone: sla.tone,
        policyAuto: Boolean(ticket.slaAutoFilled?.policy),
        unassigned: ticket.assigneeId.trim() === '',
        note: ticket.note,
        closedOnLabel: formatDate(ticket.closedOn),
      };
    });
  }

  private toPersonRows(
    people: readonly Person[],
    tickets: readonly Ticket[],
    weights: Parameters<typeof scorePerson>[2],
    quotas: Record<Person['level'], number>,
  ): PersonRow[] {
    const rubricOpts = this.rubricOptions();
    return people.map((person) => {
      const score = scorePerson(person, tickets, weights, rubricOpts);
      const isRd = normalizeTrack(person.track) === 'RND';
      const weighted = isRd ? score.dodWeightedScore : score.weightedScore;
      const sidePct = isRd ? score.spikeRatio * 100 : score.unplannedRatio * 100;
      const sideState = isRd
        ? score.spikeInBand
          ? 'ในช่วง'
          : 'นอกช่วง'
        : score.unplannedRatio <= UNPLANNED_TARGET
          ? 'ตามเป้า'
          : 'เกินเป้า';
      const planCap = score.planRawPct > 100 ? ' · ดัชนีใช้ 100' : '';
      return {
        id: person.id,
        nickname: person.nickname,
        role: person.role,
        personLabel: `${person.nickname} · ${person.role}`,
        level: person.level,
        track: person.track,
        trackLabel: trackLabel(person.track),
        quota: quotas[person.level],
        index: score.developmentIndex,
        planRawPct: score.planRawPct,
        planLabel: `${formatPercent(score.planRawPct)}% · ${formatMd(score.closedMd)}/${formatMd(score.plannedMd)}${planCap}`,
        weighted,
        reworkPct: score.reworkRate * 100,
        sidePct,
        sideLabel: `${formatPercent(sidePct)}% · ${sideState}`,
        color: trackHexColor(person.track),
        target: INDEX_TARGET,
      };
    });
  }

  async submitDispute(
    ticketId: string,
    requestedFlag: VarianceCode,
    reason: string,
    evidenceUrl?: string,
  ): Promise<TicketDispute | null> {
    if (!this.mockModeState() && this.usingApi() && this.api) {
      try {
        const res = await this.api.createDispute({ ticketId, requestedFlag, reason, evidenceUrl });
        if (res?.ok && res?.dispute) {
          this.disputesState.update((list) => [res.dispute, ...list]);
          return res.dispute;
        }
        this.notice?.error('ส่งคำขอทบทวนคะแนนไม่สำเร็จ');
        return null;
      } catch (err) {
        this.notice?.error(err instanceof Error ? err.message : 'ส่งคำขอทบทวนคะแนนไม่สำเร็จ');
        return null;
      }
    }

    const ticket = this.ticketsState().find((t) => t.id === ticketId);
    const person = this.roster().find((p) => p.id === ticket?.assigneeId) ?? this.roster()[0];
    if (!person) return null;

    const sim = ticket
      ? simulateDisputeImpact(ticket, person, this.ticketsState(), requestedFlag)
      : { scoreBefore: 60, scoreProjected: 100, scoreDiff: 40, personIndexBefore: 70, personIndexProjected: 76, personIndexDiff: 6 };

    const newDispute: TicketDispute = {
      id: `dsp-${Date.now()}`,
      disputeCode: `DSP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      ticketId,
      requesterId: person.id,
      requestedFlag,
      reason,
      evidenceUrl,
      scoreBefore: sim.scoreBefore,
      scoreProjected: sim.scoreProjected,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.disputesState.update((list) => [newDispute, ...list]);
    return newDispute;
  }

  async resolveDispute(id: string, status: 'APPROVED' | 'REJECTED', comment?: string): Promise<boolean> {
    if (!this.mockModeState() && this.usingApi() && this.api) {
      try {
        const res = await this.api.resolveDispute(id, status, comment);
        if (!res?.ok) {
          this.notice?.error('พิจารณาคำขอทบทวนคะแนนไม่สำเร็จ');
          return false;
        }
        if (res.dispute) {
          this.disputesState.update((list) => list.map((d) => (d.id === id ? res.dispute : d)));
        }
        if (res.ticket) {
          this.replaceLocal(res.ticket);
        }
        return true;
      } catch (err) {
        this.notice?.error(err instanceof Error ? err.message : 'พิจารณาคำขอทบทวนคะแนนไม่สำเร็จ');
        return false;
      }
    }

    this.disputesState.update((list) =>
      list.map((d) =>
        d.id === id
          ? {
              ...d,
              status,
              reviewerComment: comment,
              resolvedAt: new Date().toISOString(),
            }
          : d,
      ),
    );

    if (status === 'APPROVED') {
      const dispute = this.disputesState().find((d) => d.id === id);
      if (dispute) {
        const ticket = this.ticketsState().find((t) => t.id === dispute.ticketId);
        if (ticket) {
          this.replaceLocal({
            ...ticket,
            varianceCode: dispute.requestedFlag,
            reopenCount:
              dispute.requestedReopenOverride ??
              (dispute.requestedFlag === 'REQ' || dispute.requestedFlag === 'BLK' ? 0 : ticket.reopenCount),
            blocker: dispute.requestedFlag === 'BLK' ? false : ticket.blocker,
          });
        }
      }
    }

    return true;
  }

  addEmployeeLeave(leave: Omit<EmployeeLeave, 'id'>): void {
    const item: EmployeeLeave = {
      ...leave,
      id: `leave-${Date.now()}`,
    };
    this.leavesState.update((list) => [...list, item]);
    if (!this.mockModeState() && this.usingApi() && this.api) {
      void this.api
        .createLeave(item)
        .then((res) => {
          if (res?.leave) {
            this.leavesState.update((list) => list.map((row) => (row.id === item.id ? res.leave! : row)));
          }
        })
        .catch((err) => {
          this.leavesState.update((list) => list.filter((row) => row.id !== item.id));
          this.notice?.error(err instanceof Error ? err.message : 'บันทึกวันลาไม่สำเร็จ');
        });
    }
  }

  removeEmployeeLeave(id: string): void {
    const removed = this.leavesState().find((item) => item.id === id);
    this.leavesState.update((list) => list.filter((item) => item.id !== id));
    if (!this.mockModeState() && this.usingApi() && this.api) {
      void this.api
        .deleteLeave(id)
        .then((res) => {
          if (res && res.ok === false && removed) {
            this.leavesState.update((list) => [...list, removed]);
            this.notice?.error('ลบวันลาไม่สำเร็จ');
          }
        })
        .catch((err) => {
          if (removed) {
            this.leavesState.update((list) => [...list, removed]);
          }
          this.notice?.error(err instanceof Error ? err.message : 'ลบวันลาไม่สำเร็จ');
        });
    }
  }

  updateTicketAllocations(ticketId: string, allocations: TicketAllocation[]): void {
    const prevAllocs = this.allocationsState().filter((a) => a.ticketId === ticketId);
    this.allocationsState.update((list) => [
      ...list.filter((a) => a.ticketId !== ticketId),
      ...allocations,
    ]);
    if (!this.mockModeState() && this.usingApi() && this.api) {
      void this.api.saveAllocations(ticketId, allocations).catch((err) => {
        this.allocationsState.update((list) => [
          ...list.filter((a) => a.ticketId !== ticketId),
          ...prevAllocs,
        ]);
        this.notice?.error(err instanceof Error ? err.message : 'บันทึกสัดส่วนงานร่วมไม่สำเร็จ');
      });
    }
  }

  autoShiftWipDueDates(assigneeId: string, shiftDays: number): number {
    let shiftedCount = 0;
    this.ticketsState.update((tickets) =>
      tickets.map((t) => {
        if (t.assigneeId === assigneeId && t.workflowStatus === 'In Progress' && t.firstDueOn) {
          shiftedCount++;
          const shiftedDue = addWorkingDays(t.firstDueOn, shiftDays);
          return {
            ...t,
            firstDueOn: shiftedDue,
            note: `${t.note ? t.note + ' · ' : ''}เลื่อนกำหนดส่ง ${shiftDays} วันทำงานจากงานแทรก`,
          };
        }
        return t;
      }),
    );
    return shiftedCount;
  }

  async applyMdMandateShift(mdTicketId: string, targetTicketIds: string[], shiftDays: number): Promise<boolean> {
    const mdTicket = this.ticketsState().find((t) => t.id === mdTicketId);
    if (!mdTicket) return false;

    if (!this.mockModeState() && this.usingApi() && this.api) {
      try {
        const res = await this.api.shiftForMdMandate({ mdTicketId, targetTicketIds, shiftDays });
        if (res.ok && res.updatedTickets) {
          for (const ut of res.updatedTickets) {
            this.replaceLocal(ut);
          }
          return true;
        }
        this.notice?.error('เลื่อนกำหนดส่งงานด่วน MD ไม่สำเร็จ');
        return false;
      } catch (err) {
        this.notice?.error(err instanceof Error ? err.message : 'เลื่อนกำหนดส่งงานด่วน MD ไม่สำเร็จ');
        return false;
      }
    }

    // Offline / mock sandbox only
    const nowIso = new Date().toISOString();
    this.ticketsState.update((tickets) =>
      tickets.map((t) => {
        if (targetTicketIds.includes(t.id)) {
          const orig = t.originalFirstDueOn || t.firstDueOn || null;
          const newDueStr = addWorkingDays(t.firstDueOn || todayInBangkok(), shiftDays);
          return {
            ...t,
            isPaused: true,
            pausedReason: 'Paused (By MD Mandate)',
            originalFirstDueOn: orig,
            firstDueOn: newDueStr,
            dueOn: newDueStr,
            pausedAt: nowIso,
            pausedDays: (t.pausedDays || 0) + shiftDays,
            pausedByTicketId: mdTicket.id,
          };
        }
        return t;
      }),
    );
    return true;
  }

  async resumePausedTicket(ticketId: string): Promise<boolean> {
    if (!this.mockModeState() && this.usingApi() && this.api) {
      try {
        const res = await this.api.resumeTicket(ticketId);
        if (res.ok && res.ticket) {
          this.replaceLocal(res.ticket);
          return true;
        }
        this.notice?.error('กลับมาดำเนินงานต่อไม่สำเร็จ');
        return false;
      } catch (err) {
        this.notice?.error(err instanceof Error ? err.message : 'กลับมาดำเนินงานต่อไม่สำเร็จ');
        return false;
      }
    }

    this.ticketsState.update((tickets) =>
      tickets.map((t) => {
        if (t.id === ticketId) {
          return {
            ...t,
            isPaused: false,
            pausedReason: null,
            pausedAt: null,
          };
        }
        return t;
      }),
    );
    return true;
  }

  async pingHandoffRecipient(ticketId: string, target?: string, message?: string): Promise<{
    ok: boolean;
    message: string;
  }> {
    if (this.usingApi() && this.api) {
      try {
        const res = await this.api.pingHandoff(ticketId, target, message);
        return {
          ok: Boolean(res?.ok ?? true),
          message: res?.message ?? `แจ้งเตือนใบงาน ${ticketId} แล้ว`,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'ส่ง Ping ไม่สำเร็จ',
        };
      }
    }
    return { ok: true, message: `จำลอง Ping ใบงาน ${ticketId} ถึง ${target ?? 'ทีมที่เกี่ยวข้อง'}` };
  }
}

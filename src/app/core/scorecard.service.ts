import { Injectable, computed, inject, signal } from '@angular/core';
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
  levelOverrides,
  trackWeights,
  weeklyQuotas,
} from './admin-settings';
import { collectAlerts } from './alerts';
import { ApiClient } from './api-client';
import { planNewWork } from './capacity';
import { MyGitCommit, MyGitMatch, MyGitSyncResult, MyGitUnmatched } from './mygit-sync';
import { scorePartNotes } from './kpi-meaning';
import {
  EmployeeLeave,
  Level,
  Person,
  Ticket,
  TicketAllocation,
  TicketDispute,
  TicketStageLog,
  Track,
  VarianceCode,
} from './models';
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
import { applyGanttDateEdit } from './work-views';
import {
  INDEX_TARGET,
  UNPLANNED_TARGET,
  calculateMdMandateShare,
  formatMd,
  formatPercent,
  scorePerson,
  scoreTicket,
} from './scoring';
import { setSessionUser } from './session';

function optionalApiClient(): ApiClient | null {
  try {
    return inject(ApiClient, { optional: true });
  } catch {
    return null;
  }
}

export interface TicketRow {
  id: string;
  track: Track;
  trackLabel: string;
  type: Ticket['type'];
  module: string;
  size: Ticket['size'];
  points: number;
  assignee: string;
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
  return track === 'RD' ? 'R&D' : 'Implement';
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
  return new Map(people.map((person) => [person.id, person]));
}

interface LocalSnapshot {
  people: Person[];
  tickets: Ticket[];
  sequence: number;
}

@Injectable({ providedIn: 'root' })
export class ScorecardService {
  private readonly peopleState = signal<Person[]>(SEED_PEOPLE.map((person) => ({ ...person })));
  private readonly ticketsState = signal<Ticket[]>(SEED_TICKETS.map((ticket) => ({ ...ticket })));
  private readonly sequence = signal(1);
  private readonly apiOnline = signal(false);
  private readonly readyState = signal(false);
  private readonly mockModeState = signal(false);
  private snapshot: LocalSnapshot | null = null;

  private readonly allocationsState = signal<TicketAllocation[]>([...SEED_ALLOCATIONS]);
  private readonly stageLogsState = signal<TicketStageLog[]>([...SEED_STAGE_LOGS]);
  private readonly leavesState = signal<EmployeeLeave[]>([...SEED_LEAVES]);
  private readonly disputesState = signal<TicketDispute[]>([...SEED_DISPUTES]);

  readonly people = computed(() => this.peopleState());
  readonly tickets = this.ticketsState.asReadonly();
  readonly allocations = this.allocationsState.asReadonly();
  readonly stageLogs = this.stageLogsState.asReadonly();
  readonly leaves = this.leavesState.asReadonly();
  readonly disputes = this.disputesState.asReadonly();
  readonly apiReady = this.readyState.asReadonly();
  readonly usingApi = this.apiOnline.asReadonly();
  readonly mockMode = this.mockModeState.asReadonly();

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

  readonly mdMandateReport = computed(() =>
    calculateMdMandateShare(this.ticketsState()),
  );

  readonly roster = computed(() =>
    this.peopleState().map((person) => ({
      ...person,
      level: levelOverrides()[person.id] ?? person.level,
      access: accessOverrides()[person.id] ?? person.access ?? 'member',
    })),
  );

  readonly ticketRows = computed(() => this.toTicketRows(this.ticketsState(), alertRules()));

  readonly personRows = computed(() =>
    this.toPersonRows(this.roster(), this.ticketsState(), trackWeights(), weeklyQuotas()),
  );

  readonly alerts = computed(() => {
    const rules = alertRules();
    return collectAlerts(this.ticketsState(), rules.overrunLimit).filter((alert) =>
      alert.kind === 'deadline' ? rules.deadline : rules.overrun,
    );
  });

  readonly workPlan = computed(() =>
    planNewWork(this.roster(), this.ticketsState(), weeklyQuotas(), this.leavesState()),
  );

  private readonly devLoginEnabledState = signal(true);
  readonly devLoginEnabled = this.devLoginEnabledState.asReadonly();

  private readonly api = optionalApiClient();

  constructor() {
    if (this.api) {
      void this.reloadFromApi();
    } else {
      this.readyState.set(true);
    }
  }

  async reloadFromApi(): Promise<boolean> {
    if (this.mockModeState()) {
      this.readyState.set(true);
      return false;
    }
    if (!this.api) {
      this.readyState.set(true);
      return false;
    }
    try {
      const data = await this.api.bootstrap();
      if (this.mockModeState()) {
        this.readyState.set(true);
        return false;
      }
      this.peopleState.set(data.people.map((person) => ({ ...person })));
      this.ticketsState.set(data.tickets.map((ticket) => ({ ...ticket })));
      this.disputesState.set((data.disputes ?? []).map((item) => ({ ...item })));
      this.leavesState.set((data.leaves ?? []).map((item) => ({ ...item })));
      this.stageLogsState.set((data.stageLogs ?? []).map((item) => ({ ...item })));
      this.allocationsState.set((data.allocations ?? []).map((item) => ({ ...item })));
      this.devLoginEnabledState.set(data.auth.devLoginEnabled ?? false);
      applyRemoteSettings(data.settings);
      if (data.auth.authenticated && data.auth.person) {
        setSessionUser(data.auth.person, data.auth.access ?? data.auth.person.access ?? 'member');
      } else {
        setSessionUser(null, null);
      }
      this.apiOnline.set(true);
      this.readyState.set(true);
      return true;
    } catch {
      this.apiOnline.set(false);
      this.readyState.set(true);
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
    this.readyState.set(true);
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
      void this.api.createWorkItem(ticket).then((result) => {
        if (result.ticket) {
          this.replaceLocal(result.ticket);
        }
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
      this.ticketsState.update((current) => [...current, ...added]);
      if (!this.mockModeState() && this.apiOnline() && this.api) {
        void this.api.importWorkItems(added);
      }
    }
    return { added: added.map((ticket) => ticket.id), skipped };
  }

  replaceTicket(next: Ticket): boolean {
    let updated = false;
    this.ticketsState.update((current) =>
      current.map((ticket) => {
        if (ticket.id !== next.id) {
          return ticket;
        }
        updated = true;
        return { ...next, id: ticket.id };
      }),
    );
    if (updated && !this.mockModeState() && this.apiOnline() && this.api) {
      void this.api.replaceWorkItem(next);
    }
    return updated;
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
      const reviewBefore = scoreTicket(ticket).review;
      pending.set(ticket.id, {
        reviewRounds: commit.reviewRounds,
        reopenCount: commit.reopenCount,
        mrLink: commit.mrLink,
      });
      const reviewAfter = scoreTicket({
        ...ticket,
        reviewRounds: commit.reviewRounds,
        reopenCount: commit.reopenCount,
      }).review;
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
          if (!this.mockModeState() && this.apiOnline() && this.api) {
            void this.api.replaceWorkItem(next);
          }
          return next;
        }),
      );
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

  private toTicketRows(
    tickets: readonly Ticket[],
    rules: { deadline: boolean; overrun: boolean; overrunLimit: number },
  ): TicketRow[] {
    const people = personById(this.peopleState());
    return tickets.map((ticket) => {
      const score = scoreTicket(ticket);
      const person = ticket.assigneeId ? people.get(ticket.assigneeId) : undefined;
      const scored = score.total !== null;
      const alerts = collectAlerts([ticket], rules.overrunLimit).filter((alert) =>
        alert.kind === 'deadline' ? rules.deadline : rules.overrun,
      );
      return {
        id: ticket.id,
        track: ticket.track,
        trackLabel: trackLabel(ticket.track),
        type: ticket.type,
        module: ticket.module,
        size: ticket.size,
        points: score.points,
        assignee: person ? `${person.nickname} · ${person.role}` : ticket.assigneeId ? ticket.assigneeId : 'ยังไม่มีผู้รับ',
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
    return people.map((person) => {
      const score = scorePerson(person, tickets, weights);
      const weighted = person.track === 'Implement' ? score.weightedScore : score.dodWeightedScore;
      const sidePct =
        person.track === 'Implement' ? score.unplannedRatio * 100 : score.spikeRatio * 100;
      const sideState =
        person.track === 'Implement'
          ? score.unplannedRatio <= UNPLANNED_TARGET
            ? 'ตามเป้า'
            : 'เกินเป้า'
          : score.spikeInBand
            ? 'ในช่วง'
            : 'นอกช่วง';
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
        color: person.track === 'RD' ? '#3ec6e0' : '#7eb6ff',
        target: INDEX_TARGET,
      };
    });
  }

  async submitDispute(
    ticketId: string,
    requestedFlag: VarianceCode,
    reason: string,
    evidenceUrl?: string,
  ): Promise<TicketDispute> {
    const ticket = this.ticketsState().find((t) => t.id === ticketId);
    const person = this.roster().find((p) => p.id === ticket?.assigneeId) ?? this.roster()[0];

    const sim = ticket && person
      ? simulateDisputeImpact(ticket, person, this.ticketsState(), requestedFlag)
      : { scoreBefore: 60, scoreProjected: 100, scoreDiff: 40, personIndexBefore: 70, personIndexProjected: 76, personIndexDiff: 6 };

    const newDispute: TicketDispute = {
      id: `dsp-${Date.now()}`,
      disputeCode: `DSP-2026-${Math.floor(100 + Math.random() * 900)}`,
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

    if (this.usingApi() && this.api) {
      try {
        const res = await this.api.createDispute({ ticketId, requestedFlag, reason, evidenceUrl });
        if (res?.dispute) {
          this.disputesState.update((list) => [res.dispute, ...list]);
          return res.dispute;
        }
      } catch {
        // Fallback to local
      }
    }

    this.disputesState.update((list) => [newDispute, ...list]);
    return newDispute;
  }

  async resolveDispute(id: string, status: 'APPROVED' | 'REJECTED', comment?: string): Promise<boolean> {
    if (this.usingApi() && this.api) {
      try {
        const res = await this.api.resolveDispute(id, status, comment);
        if (res?.dispute) {
          this.disputesState.update((list) => list.map((d) => (d.id === id ? res.dispute : d)));
        }
        if (res?.ticket) {
          this.replaceLocal(res.ticket);
        }
        return Boolean(res?.ok ?? true);
      } catch {
        // Fallback to local state below
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
          this.replaceTicket({
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
    if (this.usingApi() && this.api) {
      void this.api.createLeave(item).then((res) => {
        if (res?.leave) {
          this.leavesState.update((list) => list.map((row) => (row.id === item.id ? res.leave! : row)));
        }
      });
    }
  }

  removeEmployeeLeave(id: string): void {
    this.leavesState.update((list) => list.filter((item) => item.id !== id));
    if (this.usingApi() && this.api) {
      void this.api.deleteLeave(id);
    }
  }

  updateTicketAllocations(ticketId: string, allocations: TicketAllocation[]): void {
    this.allocationsState.update((list) => [
      ...list.filter((a) => a.ticketId !== ticketId),
      ...allocations,
    ]);
    if (this.usingApi() && this.api) {
      void this.api.saveAllocations(ticketId, allocations);
    }
  }

  autoShiftWipDueDates(assigneeId: string, shiftDays: number): number {
    let shiftedCount = 0;
    this.ticketsState.update((tickets) =>
      tickets.map((t) => {
        if (t.assigneeId === assigneeId && t.workflowStatus === 'In Progress' && t.firstDueOn) {
          shiftedCount++;
          const current = new Date(t.firstDueOn);
          current.setDate(current.getDate() + shiftDays);
          return {
            ...t,
            firstDueOn: current.toISOString().slice(0, 10),
            note: `${t.note ? t.note + ' · ' : ''}เลื่อนกำหนดส่ง ${shiftDays} วันจากงานแทรก`,
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

    if (this.usingApi() && this.api) {
      try {
        const res = await this.api.shiftForMdMandate({ mdTicketId, targetTicketIds, shiftDays });
        if (res.ok && res.updatedTickets) {
          for (const ut of res.updatedTickets) {
            this.replaceTicket(ut);
          }
          return true;
        }
      } catch (err) {
        console.warn('API shift failed, falling back to local state:', err);
      }
    }

    // Local fallback
    const nowIso = new Date().toISOString();
    this.ticketsState.update((tickets) =>
      tickets.map((t) => {
        if (targetTicketIds.includes(t.id)) {
          const orig = t.originalFirstDueOn || t.firstDueOn || null;
          const currentDue = new Date(t.firstDueOn || new Date());
          let added = 0;
          while (added < shiftDays) {
            currentDue.setDate(currentDue.getDate() + 1);
            if (currentDue.getDay() !== 0 && currentDue.getDay() !== 6) added++;
          }
          const newDueStr = currentDue.toISOString().slice(0, 10);

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
    if (this.usingApi() && this.api) {
      try {
        const res = await this.api.resumeTicket(ticketId);
        if (res.ok && res.ticket) {
          this.replaceTicket(res.ticket);
          return true;
        }
      } catch (err) {
        console.warn('API resume failed, falling back to local state:', err);
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

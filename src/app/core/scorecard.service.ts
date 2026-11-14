import { Injectable, computed, inject, signal } from '@angular/core';
import { SEED_PEOPLE, SEED_TICKETS } from '../data/seed';
import {
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
import { Level, Person, Ticket, Track } from './models';
import { applyGanttDateEdit } from './work-views';
import {
  INDEX_TARGET,
  UNPLANNED_TARGET,
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

  readonly people = computed(() => this.peopleState());
  readonly tickets = this.ticketsState.asReadonly();
  readonly apiReady = this.readyState.asReadonly();
  readonly usingApi = this.apiOnline.asReadonly();
  readonly mockMode = this.mockModeState.asReadonly();

  readonly roster = computed(() =>
    this.peopleState().map((person) => ({
      ...person,
      level: levelOverrides()[person.id] ?? person.level,
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

  readonly workPlan = computed(() => planNewWork(this.roster(), this.ticketsState(), weeklyQuotas()));

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
}

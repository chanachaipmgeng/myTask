import { Injectable, computed, signal } from '@angular/core';
import { SEED_PEOPLE, SEED_TICKETS } from '../data/seed';
import { alertRules, levelOverrides, trackWeights, weeklyQuotas } from './admin-settings';
import { collectAlerts } from './alerts';
import { planNewWork } from './capacity';
import { MyGitCommit, MyGitMatch, MyGitSyncResult, MyGitUnmatched } from './mygit-sync';
import { scorePartNotes } from './kpi-meaning';
import { Level, Person, Ticket, Track } from './models';
import {
  INDEX_TARGET,
  UNPLANNED_TARGET,
  formatMd,
  formatPercent,
  scorePerson,
  scoreTicket,
} from './scoring';

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

@Injectable({ providedIn: 'root' })
export class ScorecardService {
  readonly people: readonly Person[] = SEED_PEOPLE;

  private readonly ticketsState = signal<Ticket[]>(SEED_TICKETS.map((ticket) => ({ ...ticket })));
  private readonly sequence = signal(1);

  readonly tickets = this.ticketsState.asReadonly();

  readonly roster = computed(() =>
    this.people.map((person) => ({
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

  addTicket(input: Omit<Ticket, 'id'>): Ticket {
    const ticket: Ticket = { ...input, id: `T-${String(this.sequence()).padStart(3, '0')}` };
    this.sequence.update((value) => value + 1);
    this.ticketsState.update((current) => [...current, ticket]);
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
    return updated;
  }

  assignTicket(ticketId: string, assigneeId: string): boolean {
    if (!this.people.some((person) => person.id === assigneeId)) {
      return false;
    }
    let updated = false;
    this.ticketsState.update((current) =>
      current.map((ticket) => {
        if (ticket.id !== ticketId || ticket.assigneeId !== '') {
          return ticket;
        }
        updated = true;
        return { ...ticket, assigneeId };
      }),
    );
    return updated;
  }

  applyMyGit(commits: readonly MyGitCommit[]): MyGitSyncResult {
    const byId = new Map(this.ticketsState().map((ticket) => [ticket.id, ticket]));
    const pending = new Map<string, { reviewRounds: number; reopenCount: number }>();
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
      pending.set(ticket.id, { reviewRounds: commit.reviewRounds, reopenCount: commit.reopenCount });
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
      });
    }
    if (pending.size > 0) {
      this.ticketsState.update((current) =>
        current.map((ticket) => {
          const update = pending.get(ticket.id);
          if (!update) {
            return ticket;
          }
          return { ...ticket, reviewRounds: update.reviewRounds, reopenCount: update.reopenCount };
        }),
      );
    }
    return { matched, unmatched };
  }

  private toTicketRows(
    tickets: readonly Ticket[],
    rules: { deadline: boolean; overrun: boolean; overrunLimit: number },
  ): TicketRow[] {
    const people = personById(this.people);
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

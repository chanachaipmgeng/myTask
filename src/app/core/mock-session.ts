import { Injectable, computed, inject, signal } from '@angular/core';
import { SEED_PEOPLE } from '../data/seed';
import { trackWeights } from './admin-settings';
import { CapacityRow, planNewWork } from './capacity';
import {
  MOCK_RETURN_TAGS,
  MOCK_SPRINT,
  MOCK_STEPS,
  MockSessionState,
  SizedTicketDraft,
  applyEstimates,
  applyReturnTags,
  assignFromCapacity,
  emptyMockState,
  enterSprint,
  estimateDrafts,
  filterMockPeople,
  intakeTickets,
  openRound,
  settleTickets,
} from './mock-scenario';
import { Person, Ticket } from './models';
import { scorePerson, scoreTicket } from './scoring';
import { ScorecardService } from './scorecard.service';

export interface MockStepResult {
  ok: boolean;
  message: string;
  links: { label: string; route: string }[];
}

export interface MockScoreSummary {
  id: string;
  title: string;
  size: string;
  assignee: string;
  estimateMd: number;
  actualMd: number;
  weekOffset: number;
  score: number | null;
  spikeScore: number | null;
  unplanned: boolean;
  closed: boolean;
}

@Injectable({ providedIn: 'root' })
export class MockSession {
  private readonly scorecard = inject(ScorecardService);
  private readonly state = signal<MockSessionState>(emptyMockState());
  private readonly lastMessage = signal('ยังไม่ได้เปิดโหมดจำลอง');

  readonly active = this.scorecard.mockMode;
  readonly step = computed(() => this.state().step);
  readonly steps = MOCK_STEPS;
  readonly currentStep = computed(() => MOCK_STEPS[Math.min(this.state().step, MOCK_STEPS.length - 1)]);
  readonly log = computed(() => this.state().log);
  readonly message = this.lastMessage.asReadonly();
  readonly drafts = computed(() => this.state().drafts);
  readonly sprint = computed(() => this.state().sprint);
  readonly capacityRows = computed<CapacityRow[]>(() => {
    if (!this.scorecard.mockMode()) {
      return [];
    }
    return planNewWork(this.scorecard.roster(), this.scorecard.tickets()).rows;
  });
  readonly scoreSummary = computed(() => this.toScoreSummary(this.scorecard.people(), this.scorecard.tickets()));
  readonly finished = computed(() => this.state().step >= MOCK_STEPS.length);

  enter(): MockStepResult {
    const fromLive = filterMockPeople(this.scorecard.people());
    const peopleForMock = fromLive.length > 0 ? fromLive : filterMockPeople(SEED_PEOPLE);
    this.scorecard.enterMockSandbox(peopleForMock, []);
    this.state.set({ ...emptyMockState(), log: ['เปิดโหมดจำลองแล้ว ไม่เขียนฐานข้อมูล'] });
    this.lastMessage.set('เปิดโหมดจำลองแล้ว กดทำทีละขั้นหรือเล่นทั้งเรื่อง');
    return {
      ok: true,
      message: this.lastMessage(),
      links: [{ label: 'คิวงานใหม่', route: '/queue' }],
    };
  }

  exit(): MockStepResult {
    this.scorecard.exitMockSandbox();
    this.state.set(emptyMockState());
    this.lastMessage.set('ออกจากโหมดจำลองแล้ว คืนข้อมูลเดิม');
    return { ok: true, message: this.lastMessage(), links: [{ label: 'แดชบอร์ดทีม', route: '/team' }] };
  }

  runStep(): MockStepResult {
    if (!this.scorecard.mockMode()) {
      return this.enter();
    }
    const index = this.state().step;
    if (index >= MOCK_STEPS.length) {
      this.lastMessage.set('จบเรื่องแล้ว เปิดแดชบอร์ดเพื่อดูคะแนน');
      return {
        ok: true,
        message: this.lastMessage(),
        links: [
          { label: 'แดชบอร์ดทีม', route: '/team' },
          { label: 'กระดานรายคน', route: '/people' },
        ],
      };
    }
    const result = this.execute(index);
    this.state.update((current) => ({
      ...current,
      step: current.step + 1,
      log: [...current.log, result.message],
    }));
    this.lastMessage.set(result.message);
    return result;
  }

  playAll(): MockStepResult {
    if (!this.scorecard.mockMode()) {
      this.enter();
    }
    let last: MockStepResult = {
      ok: true,
      message: 'เริ่มเล่นทั้งเรื่อง',
      links: [],
    };
    while (this.state().step < MOCK_STEPS.length) {
      last = this.runStep();
    }
    this.lastMessage.set('เล่นทั้งเรื่องครบแล้ว ดูแดชบอร์ด คิว และปฏิทินได้เลย');
    return {
      ok: true,
      message: this.lastMessage(),
      links: [
        { label: 'แดชบอร์ดทีม', route: '/team' },
        { label: 'กระดานรายคน', route: '/people' },
        { label: 'คิวงานใหม่', route: '/queue' },
        { label: 'ปฏิทินทีม', route: '/schedule' },
        { label: 'สถานะงาน', route: '/pipeline' },
      ],
    };
  }

  private execute(index: number): MockStepResult {
    switch (index) {
      case 0:
        return this.stepIntake();
      case 1:
        return this.stepRubric();
      case 2:
        return this.stepSprint();
      case 3:
        return this.stepRound();
      case 4:
        return this.stepAssign();
      case 5:
        return this.stepManpower();
      case 6:
        return this.stepTags();
      case 7:
        return this.stepSettle();
      case 8:
        return this.stepBoards();
      default:
        return { ok: false, message: 'ไม่มีขั้นนี้', links: [] };
    }
  }

  private stepIntake(): MockStepResult {
    const tickets = intakeTickets();
    this.scorecard.setMockTickets(tickets);
    this.state.update((current) => ({ ...current, tickets }));
    return {
      ok: true,
      message: `รับใบงาน ${tickets.length} ใบ (ยังไม่รวมงานนอกแผน)`,
      links: [{ label: 'ใบงาน', route: '/tickets' }],
    };
  }

  private stepRubric(): MockStepResult {
    const drafts = estimateDrafts();
    const tickets = applyEstimates(this.scorecard.tickets(), drafts);
    this.scorecard.setMockTickets(tickets);
    this.state.update((current) => ({ ...current, drafts, tickets }));
    const summary = drafts
      .filter((draft) => !draft.blueprint.lateEntry)
      .map((draft) => `${draft.blueprint.id}=${draft.size}/${draft.estimateMd}MD`)
      .join(', ');
    return {
      ok: true,
      message: `ประเมินขนาดตามรูบริกแล้ว: ${summary}`,
      links: [{ label: 'ใบงาน', route: '/tickets' }],
    };
  }

  private stepSprint(): MockStepResult {
    const tickets = enterSprint(this.scorecard.tickets(), MOCK_SPRINT);
    this.scorecard.setMockTickets(tickets);
    this.state.update((current) => ({ ...current, sprint: MOCK_SPRINT, tickets }));
    return {
      ok: true,
      message: `นำเข้า ${MOCK_SPRINT.name} (${MOCK_SPRINT.startOn} → ${MOCK_SPRINT.endOn}) ยังไม่แจกคน`,
      links: [{ label: 'สถานะงาน', route: '/pipeline' }],
    };
  }

  private stepRound(): MockStepResult {
    const drafts = this.state().drafts.length > 0 ? this.state().drafts : estimateDrafts();
    const tickets = openRound(this.scorecard.tickets(), drafts, MOCK_SPRINT);
    this.scorecard.setMockTickets(tickets);
    this.state.update((current) => ({ ...current, drafts, roundOpen: true, tickets }));
    return {
      ok: true,
      message: `เปิดรอบแล้ว ล็อกวันส่ง ${MOCK_SPRINT.endOn} และเพิ่ม MOCK-UNPLANNED เป็นงานนอกแผน`,
      links: [{ label: 'คิวงานใหม่', route: '/queue' }],
    };
  }

  private stepAssign(): MockStepResult {
    const result = assignFromCapacity(this.scorecard.roster(), this.scorecard.tickets());
    this.scorecard.setMockTickets(result.tickets);
    this.state.update((current) => ({ ...current, tickets: result.tickets }));
    return {
      ok: true,
      message: `แจกงานแล้ว ${result.assigned.length} ใบ · ค้างคิว ${result.skipped.join(', ') || 'ไม่มี'}`,
      links: [
        { label: 'คิวงานใหม่', route: '/queue' },
        { label: 'สถานะงาน', route: '/pipeline' },
      ],
    };
  }

  private stepManpower(): MockStepResult {
    const rows = planNewWork(this.scorecard.roster(), this.scorecard.tickets()).rows;
    const free = rows.filter((row) => row.available).map((row) => `${row.nickname} ${row.freeMd}MD`);
    return {
      ok: true,
      message: `แผน manpower: คนว่าง ${free.length > 0 ? free.join(', ') : 'ไม่มี'} · ดูปฏิทินทีมได้`,
      links: [
        { label: 'คิวงานใหม่', route: '/queue' },
        { label: 'ปฏิทินทีม', route: '/schedule' },
      ],
    };
  }

  private stepTags(): MockStepResult {
    const tickets = applyReturnTags(this.scorecard.tickets(), MOCK_RETURN_TAGS);
    this.scorecard.setMockTickets(tickets);
    this.state.update((current) => ({
      ...current,
      tickets,
      tagsApplied: [...MOCK_RETURN_TAGS],
    }));
    return {
      ok: true,
      message: `ใส่แท็กส่งคืน mygitplus ${MOCK_RETURN_TAGS.length} รายการบนใบที่มีผู้รับ`,
      links: [{ label: 'สถานะงาน', route: '/pipeline' }],
    };
  }

  private stepSettle(): MockStepResult {
    const tickets = settleTickets(this.scorecard.tickets());
    this.scorecard.setMockTickets(tickets);
    this.state.update((current) => ({ ...current, tickets }));
    const closed = tickets.filter((ticket) => ticket.closed).length;
    return {
      ok: true,
      message: `คำนวณ actualMd / weekOffset แล้ว ปิดใบ ${closed} ใบ`,
      links: [
        { label: 'แดชบอร์ดทีม', route: '/team' },
        { label: 'กระดานรายคน', route: '/people' },
      ],
    };
  }

  private stepBoards(): MockStepResult {
    return {
      ok: true,
      message: 'พร้อมวิเคราะห์บนแดชบอร์ดทีม รายคน คิว ปฏิทิน และไปป์ไลน์',
      links: [
        { label: 'แดชบอร์ดทีม', route: '/team' },
        { label: 'กระดานรายคน', route: '/people' },
        { label: 'คิวงานใหม่', route: '/queue' },
        { label: 'ปฏิทินทีม', route: '/schedule' },
        { label: 'สถานะงาน', route: '/pipeline' },
      ],
    };
  }

  private toScoreSummary(people: readonly Person[], tickets: readonly Ticket[]): MockScoreSummary[] {
    const names = new Map(people.map((person) => [person.id, person.nickname]));
    return tickets.map((ticket) => {
      const scored = scoreTicket(ticket);
      return {
        id: ticket.id,
        title: ticket.title ?? ticket.module,
        size: ticket.size,
        assignee: ticket.assigneeId ? (names.get(ticket.assigneeId) ?? ticket.assigneeId) : 'ค้างคิว',
        estimateMd: ticket.estimateMd,
        actualMd: ticket.actualMd,
        weekOffset: ticket.weekOffset,
        score: scored.total,
        spikeScore: scored.spikeScore,
        unplanned: ticket.unplanned,
        closed: ticket.closed,
      };
    });
  }
}

export function mockPersonIndexes(people: readonly Person[], tickets: readonly Ticket[]): { id: string; name: string; index: number }[] {
  const weights = trackWeights();
  return people.map((person) => ({
    id: person.id,
    name: person.nickname,
    index: Math.round(scorePerson(person, tickets, weights).developmentIndex * 10) / 10,
  }));
}

export type { SizedTicketDraft };

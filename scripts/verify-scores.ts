import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canEditAdmin,
  setPersonLevel,
  setViewer,
  setWeeklyQuota,
  weeklyQuotas,
} from '../src/app/core/admin-settings';
import { collectAlerts, projectedActual } from '../src/app/core/alerts';
import { planNewWork } from '../src/app/core/capacity';
import { monthlyTrend, quotaBars } from '../src/app/core/dashboard-charts';
import { mapMyGitCommits } from '../src/app/core/mygit-sync';
import { aiTicketPoints, aiTrackLabel, researchSpikeShare } from '../src/app/core/ai-tracking';
import { teamsDrafts } from '../src/app/core/teams-notify';
import { buildPeopleRoster } from '../src/app/core/people-roster';
import { personDashboard } from '../src/app/core/person-dashboard';
import { ScorecardService } from '../src/app/core/scorecard.service';
import {
  workBacklogRows,
  workGanttTasks,
  workListRows,
  workSummaryStats,
} from '../src/app/core/work-views';
import { parseClosedTicketCsv, parseClosedTicketJson } from '../src/app/core/ticket-file';
import { Person, Ticket, TicketType } from '../src/app/core/models';
import { editWorkflow, moveWorkflow, pipelineReport } from '../src/app/core/workflow';
import {
  INDEX_TARGET,
  SIZE_POINTS,
  WEEKLY_QUOTA,
  scorePerson,
  scoreTicket,
  workloadCategory,
} from '../src/app/core/scoring';
import { REFERENCE_BUG_ID, REFERENCE_SPIKE_ID, SEED_PEOPLE, SEED_TICKETS } from '../src/app/data/seed';
import {
  MOCK_BLUEPRINTS,
  MOCK_PERSON_IDS,
  MOCK_RETURN_TAGS,
  MOCK_SPRINT,
  applyEstimates,
  applyReturnTags,
  assignFromCapacity,
  enterSprint,
  estimateDrafts,
  filterMockPeople,
  hoursToActualMd,
  intakeTickets,
  openRound,
  settleTickets,
  sizeFromRubricTotal,
  weekOffsetFromDates,
} from '../shared/domain/mock-scenario';

function ticket(overrides: Partial<Ticket> & Pick<Ticket, 'id' | 'assigneeId'>): Ticket {
  return {
    track: 'Implement',
    type: 'Feature',
    module: 'Core',
    size: 'M',
    estimateMd: 1,
    actualMd: 1,
    weekOffset: 0,
    reviewRounds: 1,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: true,
    dodPassed: false,
    inTimeBox: false,
    childTicketsSized: false,
    unplanned: false,
    closedOn: '2025-10-31',
    workingDaysLeft: null,
    note: '',
    ...overrides,
  };
}

function person(overrides: Partial<Person> & Pick<Person, 'id' | 'track'>): Person {
  return {
    nickname: 'ทดสอบ',
    fullName: 'ทดสอบ',
    role: 'โปรแกรมเมอร์',
    level: 'Mid',
    plannedMd: 4,
    ...overrides,
  };
}

function near(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} !== ${expected}`);
}

function seeded(id: string): Ticket {
  const found = SEED_TICKETS.find((item) => item.id === id);
  assert.ok(found, `missing ${id}`);
  return found;
}

const bug = scoreTicket(seeded(REFERENCE_BUG_ID));
assert.equal(bug.total, 100, 'Implement bug-fix ticket score');
assert.equal(bug.week, 40);
assert.equal(bug.accuracy, 20);
assert.equal(bug.review, 20);
assert.equal(bug.reopen, 20);
assert.equal(bug.accuracyInBand, true);

const spike = scoreTicket(seeded(REFERENCE_SPIKE_ID));
assert.equal(spike.spikeScore, 100, 'R&D spike score');
assert.equal(spike.total, 100);

const slipped = scoreTicket(seeded('IMP-SLIP'));
assert.equal(slipped.week, 20);
assert.equal(slipped.total, 80);

const reopened = scoreTicket(seeded('IMP-REOPEN'));
assert.equal(reopened.reopen, 10);
assert.equal(reopened.total, 90);

const req = scoreTicket(seeded('IMP-REQ'));
assert.equal(req.exempt, true);
assert.equal(req.week, 40);
assert.equal(req.accuracy, 20);
assert.equal(req.accuracyInBand, false);
assert.equal(req.review, 10);
assert.equal(req.total, 90);
assert.ok(req.ratio !== null && req.ratio > 2);

assert.equal(scoreTicket(seeded('IMP-BLOCK')).review, 0);
assert.equal(scoreTicket(seeded('IMP-REWORK')).total, 40);
assert.equal(scoreTicket(seeded('RD-NTH-SP')).spikeScore, 0);
assert.equal(scoreTicket(seeded('RD-PHA-SP')).spikeScore, 0);
assert.equal(scoreTicket(seeded('IMP-PAW-ENV')).accuracy, 20);
assert.equal(scoreTicket(seeded('RD-DIR-BLK')).week, 40);
assert.equal(scoreTicket(seeded('RD-DIR-BLK')).accuracy, 20);

assert.equal(scoreTicket(ticket({ id: 'zero', assigneeId: 'a', estimateMd: 0, actualMd: 1 })).accuracy, 0);
assert.equal(
  scoreTicket(ticket({ id: 'zero-req', assigneeId: 'a', estimateMd: 0, actualMd: 1, varianceCode: 'REQ', weekOffset: 2 }))
    .accuracy,
  20,
);
assert.equal(
  scoreTicket(ticket({ id: 'zero-req-week', assigneeId: 'a', estimateMd: 0, varianceCode: 'REQ', weekOffset: 2 })).week,
  40,
);

for (const [actual, points, inBand] of [
  [1.5, 20, true],
  [0.8, 20, true],
  [0.5, 10, false],
  [2, 10, false],
  [1.6, 10, false],
  [0.7, 10, false],
  [2.01, 0, false],
  [0.49, 0, false],
] as const) {
  const score = scoreTicket(ticket({ id: `band-${actual}`, assigneeId: 'a', estimateMd: 1, actualMd: actual }));
  assert.equal(score.accuracy, points, `accuracy ${actual}`);
  assert.equal(score.accuracyInBand, inBand, `band ${actual}`);
}

assert.equal(
  scoreTicket(
    ticket({
      id: 'spike-bad-box',
      assigneeId: 'a',
      track: 'RD',
      type: 'Spike',
      estimateMd: 1.5,
      actualMd: 1.5,
      inTimeBox: true,
      childTicketsSized: true,
    }),
  ).spikeScore,
  0,
);

const implement = person({ id: 'impl', track: 'Implement' });
const implementTickets = [
  ticket({ id: 'a', assigneeId: 'impl', size: 'M', actualMd: 1 }),
  ticket({ id: 'b', assigneeId: 'impl', size: 'S', weekOffset: 2, reopenCount: 2, actualMd: 1, unplanned: true }),
];
const implementScore = scorePerson(implement, implementTickets);
near(implementScore.weightedScore, 76, 'weighted');
near(implementScore.planRawPct, 50, 'plan raw');
near(implementScore.accuracyShare, 1, 'accuracy share');
near(implementScore.reworkRate, 0.5, 'rework');
near(implementScore.unplannedRatio, 0.2, 'unplanned / 5');
near(implementScore.developmentIndex, 70.5, 'implement index');

const capped = scorePerson(implement, [ticket({ id: 'big', assigneeId: 'impl', actualMd: 5, estimateMd: 1 })]);
near(capped.planRawPct, 125, 'raw plan over 100');
near(capped.planIndexPct, 100, 'plan cap');

const research = person({ id: 'rd', track: 'RD', plannedMd: 4 });
const researchTickets = [
  ticket({
    id: 'feat',
    assigneeId: 'rd',
    track: 'RD',
    type: 'Feature',
    size: 'L',
    estimateMd: 2,
    actualMd: 2,
    reviewRounds: 3,
    dodPassed: true,
  }),
  ticket({
    id: 'spk',
    assigneeId: 'rd',
    track: 'RD',
    type: 'Spike',
    size: 'M',
    estimateMd: 1,
    actualMd: 1,
    inTimeBox: true,
    childTicketsSized: true,
  }),
];
const researchScore = scorePerson(research, researchTickets);
near(researchScore.dodWeightedScore, 90, 'dod weighted');
near(researchScore.spikeQuality, 100, 'spike quality');
near(researchScore.outcomeIndexPct, 100, 'outcome');
near(researchScore.reviewReopenQuality, 84.375, 'review reopen');
near(researchScore.developmentIndex, 93.65625, 'rd index');
assert.equal(researchScore.spikeInBand, true);

const outside = scorePerson(research, [
  ticket({
    id: 'wide',
    assigneeId: 'rd',
    track: 'RD',
    type: 'Spike',
    estimateMd: 1,
    actualMd: 1,
    inTimeBox: true,
    childTicketsSized: true,
  }),
]);
near(outside.spikeRatio, 0.25, 'one spike of 1 MD on 4 planned is in band');
const high = scorePerson({ ...research, plannedMd: 2 }, researchTickets.filter((item) => item.type === 'Spike').concat([
  ticket({
    id: 'extra',
    assigneeId: 'rd',
    track: 'RD',
    type: 'Spike',
    estimateMd: 1,
    actualMd: 1,
    inTimeBox: true,
    childTicketsSized: true,
  }),
]));
assert.equal(high.spikeInBand, false);

assert.equal(WEEKLY_QUOTA.Senior, 3.5);
assert.equal(WEEKLY_QUOTA.Mid, 4);
assert.equal(WEEKLY_QUOTA.Junior, 3);
assert.equal(WEEKLY_QUOTA.FirstMonth, 2);
assert.deepEqual(SIZE_POINTS, { XS: 1, S: 2, M: 3, L: 5, XL: 8 });

const closed = SEED_TICKETS.filter((item) => item.closed);
assert.ok(closed.length >= 6);
const categories = new Set<string>();
for (const side of ['Implement', 'RD'] as const) {
  for (const kind of ['Bug', 'Customization', 'Enhancement'] as const) {
    const found = SEED_TICKETS.some(
      (item) => item.track === side && workloadCategory(item.type) === kind,
    );
    assert.ok(found, `${side} ${kind}`);
    categories.add(`${side}:${kind}`);
  }
}
assert.equal(categories.size, 6);

for (const member of SEED_PEOPLE) {
  const score = scorePerson(member, SEED_TICKETS.filter((item) => item.assigneeId === member.id));
  assert.ok(
    score.planRawPct >= 80 && score.planRawPct <= 110,
    `${member.id} plan ${score.planRawPct}`,
  );
  assert.equal(member.plannedMd, WEEKLY_QUOTA[member.level]);
  console.log(
    `${member.nickname}\t${member.track}\tindex ${score.developmentIndex.toFixed(1)}\tplan ${score.planRawPct.toFixed(1)}\tweighted ${score.weightedScore.toFixed(1)}\tdod ${score.dodWeightedScore.toFixed(1)}\tunplanned ${(score.unplannedRatio * 100).toFixed(1)}\tspike ${(score.spikeRatio * 100).toFixed(1)} ${score.spikeInBand ? 'in' : 'out'}`,
  );
}

const types = new Set(SEED_TICKETS.map((item) => item.type));
for (const type of ['Feature', 'CR', 'Bug-Investigate', 'Bug-Fix', 'Spike', 'Ops', 'TechDebt'] as TicketType[]) {
  assert.ok(types.has(type), type);
}

console.log(`IMP-100 ticket score ${bug.total}`);
console.log(`RD-SPIKE spike score ${spike.spikeScore} ticket score ${spike.total}`);

const peopleIds = SEED_PEOPLE.map((member) => member.id);
const csv = readFileSync(new URL('../public/samples/closed-tickets.csv', import.meta.url), 'utf8');
const json = readFileSync(new URL('../public/samples/closed-tickets.json', import.meta.url), 'utf8');
const importedCsv = parseClosedTicketCsv(csv, peopleIds);
const importedJson = parseClosedTicketJson(json, peopleIds);
assert.equal(importedCsv[0]?.id, 'FILE-100');
assert.equal(scoreTicket(importedCsv[0]).total, 100);
assert.equal(importedJson[0]?.id, 'FILE-JSON');
assert.equal(scoreTicket(importedJson[0]).total, 100);

const service = new ScorecardService();
const imported = service.importTickets(importedCsv);
assert.deepEqual(imported.added, ['FILE-100']);
assert.equal(scoreTicket(service.tickets().find((item) => item.id === 'IMP-100')!).total, 100);
assert.equal(scoreTicket(service.tickets().find((item) => item.id === 'RD-SPIKE')!).spikeScore, 100);
const again = service.importTickets(importedCsv);
assert.deepEqual(again.added, []);
assert.deepEqual(again.skipped, ['FILE-100']);

const alerts = collectAlerts(SEED_TICKETS);
assert.ok(alerts.some((alert) => alert.ticketId === 'IMP-OPEN' && alert.kind === 'deadline'));
assert.ok(alerts.some((alert) => alert.ticketId === 'ALERT-BURN' && alert.kind === 'overrun'));
assert.equal(alerts.filter((alert) => alert.ticketId === REFERENCE_BUG_ID).length, 0);
const burn = seeded('ALERT-BURN');
assert.equal(projectedActual(burn), 2);

const plan = planNewWork(SEED_PEOPLE, SEED_TICKETS);
assert.equal(plan.plans.find((item) => item.ticket.id === 'Q-IMP-XL')?.personId, 'watchara');
assert.equal(plan.plans.find((item) => item.ticket.id === 'Q-IMP-1')?.personId, 'paweena');
assert.equal(plan.plans.find((item) => item.ticket.id === 'Q-RD-1')?.personId, 'chanachai');
assert.ok(plan.rows.some((row) => row.id === 'paweena' && row.available && row.freeMd === 2.5));
assert.equal(service.tickets().find((item) => item.id === 'Q-IMP-1')?.assigneeId, '');
const assignPending = service.assignTicket('Q-IMP-1', 'paweena');
assert.equal(service.tickets().find((item) => item.id === 'Q-IMP-1')?.assigneeId, 'paweena');
assert.equal(service.tickets().find((item) => item.id === 'Q-IMP-XL')?.assigneeId, '');

const monthsImplement = monthlyTrend(SEED_PEOPLE, SEED_TICKETS, 'Implement');
const monthsResearch = monthlyTrend(SEED_PEOPLE, SEED_TICKETS, 'RD');
assert.ok(monthsImplement.length >= 2, 'implement months');
assert.ok(monthsResearch.length >= 2, 'rd months');
assert.ok(monthsImplement.every((point) => point.target === INDEX_TARGET));
assert.notDeepEqual(
  monthsImplement.map((point) => point.plan),
  monthsResearch.map((point) => point.plan),
);
const quotaImplement = quotaBars(SEED_PEOPLE, SEED_TICKETS, 'Implement');
const quotaResearch = quotaBars(SEED_PEOPLE, SEED_TICKETS, 'RD');
assert.ok(quotaImplement.length > 0 && quotaResearch.length > 0);
assert.notDeepEqual(
  quotaImplement.map((point) => point.nickname),
  quotaResearch.map((point) => point.nickname),
);

const itsara = SEED_PEOPLE.find((member) => member.id === 'itsara');
const chanachai = SEED_PEOPLE.find((member) => member.id === 'chanachai');
assert.ok(itsara && chanachai);
const roster = buildPeopleRoster(SEED_PEOPLE, SEED_TICKETS);
assert.equal(roster.length, SEED_PEOPLE.length);
const itsaraRow = roster.find((row) => row.id === 'itsara');
assert.ok(itsaraRow);
assert.ok(itsaraRow.openCount + itsaraRow.closedCount >= 1);
assert.ok(Number.isFinite(itsaraRow.accuracyPct));
assert.ok(itsaraRow.planLabel.includes('%'));
const implementView = personDashboard(itsara, SEED_TICKETS);
const researchView = personDashboard(chanachai, SEED_TICKETS);
assert.equal(implementView.formulaId, 'Implement');
assert.equal(researchView.formulaId, 'RD');
assert.notEqual(implementView.formula, researchView.formula);
assert.equal(implementView.index, Math.round(scorePerson(itsara, SEED_TICKETS).developmentIndex * 10) / 10);
assert.equal(researchView.index, Math.round(scorePerson(chanachai, SEED_TICKETS).developmentIndex * 10) / 10);
assert.ok(implementView.trend.length > 0 && researchView.trend.every((point) => point.target === INDEX_TARGET));
assert.equal(implementView.openCount + implementView.closedCount, SEED_TICKETS.filter((t) => t.assigneeId === 'itsara').length);
assert.equal(implementView.openWork.length, implementView.openCount);
assert.equal(implementView.closedWork.length, implementView.closedCount);
assert.ok(implementView.slipShare.length >= 1);
assert.ok(implementView.categoryShare.length >= 1);
assert.ok(implementView.effortBars.every((bar) => bar.estimateMd >= 0 && bar.actualMd >= 0));
assert.ok(implementView.qualityBars.every((bar) => bar.reviewRounds >= 0 && bar.reopenCount >= 0));
assert.ok(implementView.kpis.length >= 4);
assert.equal(scoreTicket(seeded(REFERENCE_BUG_ID)).total, 100);
assert.equal(scoreTicket(seeded(REFERENCE_SPIKE_ID)).spikeScore, 100);

const workSummary = workSummaryStats(SEED_TICKETS, SEED_PEOPLE);
assert.ok(workSummary.cards.length === 4);
assert.ok(workSummary.statusShare.length >= 1);
const workList = workListRows(SEED_TICKETS, SEED_PEOPLE);
assert.equal(workList.length, SEED_TICKETS.length);
const workBacklog = workBacklogRows(SEED_TICKETS, SEED_PEOPLE);
assert.ok(workBacklog.every((row) => row.status === 'Backlog' || row.assignee === 'ยังไม่มีผู้รับ'));
const workGantt = workGanttTasks(SEED_TICKETS, SEED_PEOPLE);
assert.ok(workGantt.length >= 1);
assert.ok(workGantt.every((task) => task.TaskID && task.TaskName));


const mygitFixture = readFileSync(new URL('../public/fixtures/mygit-commits.json', import.meta.url), 'utf8');
assert.equal(mygitFixture.includes('fileCount'), false);
assert.equal(mygitFixture.includes('filesChanged'), false);
const mygitCommits = mapMyGitCommits(JSON.parse(mygitFixture));
assert.equal(Object.hasOwn(mygitCommits[0] ?? {}, 'fileCount'), false);
const mygit = new ScorecardService();
const beforeReview = scoreTicket(mygit.tickets().find((item) => item.id === 'IMP-ITS-CR')!).review;
assert.equal(beforeReview, 20);
const mygitResult = mygit.applyMyGit(mygitCommits);
const matched = mygitResult.matched.find((item) => item.ticketId === 'IMP-ITS-CR');
assert.ok(matched);
assert.equal(matched.reviewBefore, 20);
assert.equal(matched.reviewAfter, 0);
assert.equal(scoreTicket(mygit.tickets().find((item) => item.id === 'IMP-ITS-CR')!).review, 0);
assert.equal(mygitResult.unmatched.some((item) => item.sha === 'c0ffee01'), true);
assert.equal(scoreTicket(mygit.tickets().find((item) => item.id === REFERENCE_BUG_ID)!).total, 100);
assert.equal(scoreTicket(mygit.tickets().find((item) => item.id === REFERENCE_SPIKE_ID)!).spikeScore, 100);

const drafts = teamsDrafts(SEED_TICKETS, 'dev-alerts', new Set(['deadline', 'overrun']));
const deadline = drafts.find((item) => item.kind === 'deadline');
const overrun = drafts.find((item) => item.kind === 'overrun');
assert.ok(deadline && deadline.ticketId === 'IMP-OPEN' && deadline.text.includes('IMP-OPEN'));
assert.ok(overrun && overrun.ticketId === 'ALERT-BURN' && overrun.text.includes('50%'));
assert.equal(drafts.some((item) => item.text.includes('อันดับ')), false);
assert.equal(scoreTicket(seeded(REFERENCE_BUG_ID)).total, 100);
assert.equal(scoreTicket(seeded(REFERENCE_SPIKE_ID)).spikeScore, 100);

const aiPoints = aiTicketPoints(SEED_TICKETS);
assert.equal(aiPoints.some((point) => point.id === REFERENCE_BUG_ID), false);
assert.equal(aiTrackLabel(seeded('RD-NAK-BUG')), null);
assert.ok(aiPoints.some((point) => point.id === REFERENCE_SPIKE_ID));
assert.ok(aiPoints.some((point) => point.label === 'myBOX'));
assert.ok(aiPoints.some((point) => point.label === 'AI Agent'));
const share = researchSpikeShare(SEED_PEOPLE, SEED_TICKETS);
const researchPeople = SEED_PEOPLE.filter((member) => member.track === 'RD');
const spikeMd = researchPeople.reduce((sum, member) => sum + scorePerson(member, SEED_TICKETS).spikeMd, 0);
const plannedMd = researchPeople.reduce((sum, member) => sum + member.plannedMd, 0);
near(share.ratio, plannedMd === 0 ? 0 : spikeMd / plannedMd, 'rd spike ratio');
near(share.spikeMd, spikeMd, 'rd spike md');
assert.equal(scoreTicket(seeded(REFERENCE_BUG_ID)).total, 100);
assert.equal(scoreTicket(seeded(REFERENCE_SPIKE_ID)).spikeScore, 100);

const openQuota = planNewWork(SEED_PEOPLE, SEED_TICKETS);
const tightQuota = planNewWork(SEED_PEOPLE, SEED_TICKETS, { ...WEEKLY_QUOTA, Junior: 1 });
assert.equal(openQuota.rows.find((row) => row.id === 'natthaphat')?.available, true);
assert.equal(tightQuota.rows.find((row) => row.id === 'natthaphat')?.available, false);
assert.equal(tightQuota.rows.find((row) => row.id === 'paweena')?.available, true);
assert.equal(setViewer('itsara').access, 'member');
assert.equal(canEditAdmin(), false);
assert.equal(setWeeklyQuota('Junior', 1), false);
assert.equal(setPersonLevel('natthaphat', 'Senior'), false);
assert.equal(weeklyQuotas().Junior, 3);
setViewer('paweena');
assert.equal(canEditAdmin(), true);
assert.equal(setWeeklyQuota('Junior', 1), true);
assert.equal(weeklyQuotas().Junior, 1);
setWeeklyQuota('Junior', 3);
assert.equal(scoreTicket(seeded(REFERENCE_BUG_ID)).total, 100);
assert.equal(scoreTicket(seeded(REFERENCE_SPIKE_ID)).spikeScore, 100);

const blockedStart = moveWorkflow(seeded('Q-RD-1'), 'In Progress', '2025-11-12');
assert.equal(blockedStart.ok, false);
if (!blockedStart.ok) {
  assert.match(blockedStart.message, /Assignee/);
  assert.match(blockedStart.message, /Story Points/);
  assert.match(blockedStart.message, /วันส่ง/);
}
const blockedReview = moveWorkflow(seeded('RD-OPEN'), 'Code Review', '2025-11-12');
assert.equal(blockedReview.ok, false);
if (!blockedReview.ok) {
  assert.match(blockedReview.message, /ลิงก์ MR/);
}
const openForReview = seeded('RD-OPEN');
assert.ok(!openForReview.mrLink || openForReview.mrLink.trim() === '');
const stillBlocked = moveWorkflow(
  { ...openForReview, workflowStatus: 'In Progress', actualStartOn: '2025-11-10', storyPoints: 2, firstDueOn: '2025-11-14' },
  'Code Review',
  '2025-11-12',
);
assert.equal(stillBlocked.ok, false);
if (!stillBlocked.ok) {
  assert.match(stillBlocked.message, /ลิงก์ MR/);
}
const blockedDone = moveWorkflow(seeded('RD-NAK-BUG'), 'Done', '2025-11-12');
assert.equal(blockedDone.ok, false);
if (!blockedDone.ok) {
  assert.match(blockedDone.message, /สาเหตุของ Bug/);
}
const reviewCopy: Ticket = {
  ...seeded('RD-NAK-CR'),
  workflowStatus: 'Code Review',
  mrLink: 'https://git.local/mr/x',
  storyPoints: 2,
  firstDueOn: '2025-11-01',
  actualStartOn: null,
  devDeliveredOn: null,
};
const bounced = moveWorkflow(reviewCopy, 'In Progress', '2025-11-12');
assert.equal(bounced.ok, true);
if (bounced.ok) {
  assert.equal(bounced.ticket.reopenCount, reviewCopy.reopenCount + 1);
  assert.equal(bounced.ticket.actualStartOn, '2025-11-12');
}
const ready = bounced.ok
  ? moveWorkflow(
      { ...bounced.ticket, workflowStatus: 'Code Review', mrLink: 'https://git.local/mr/x', devDeliveredOn: null },
      'Ready for QA',
      '2025-11-18',
    )
  : bounced;
assert.equal(ready.ok, true);
if (ready.ok) {
  assert.equal(ready.ticket.devDeliveredOn, '2025-11-18');
  assert.equal(ready.ticket.reopenCount, reviewCopy.reopenCount + 1);
}
const locked = editWorkflow(
  { ...seeded('Q-RD-1'), firstDueOn: '2025-11-01', assigneeId: 'chanachai' },
  {
    discipline: 'BE',
    workCategory: 'Feature',
    storyPoints: 5,
    firstDueOn: '2025-12-01',
    mrLink: '',
    pocResult: '',
    bugCause: '',
  },
);
assert.equal(locked.ok, false);
const rdReport = pipelineReport(
  SEED_TICKETS.filter((item) => item.track === 'RD'),
  SEED_PEOPLE,
);
assert.ok(rdReport.velocity.some((row) => row.points > 0));
assert.ok(rdReport.categories.some((row) => row.key === 'R&D-PoC' && row.points > 0));
assert.equal(scoreTicket(seeded(REFERENCE_BUG_ID)).total, 100);
assert.equal(scoreTicket(seeded(REFERENCE_SPIKE_ID)).spikeScore, 100);

assert.equal(sizeFromRubricTotal(3), 'S');
assert.equal(sizeFromRubricTotal(5), 'M');
assert.equal(sizeFromRubricTotal(12), 'XL');
assert.equal(hoursToActualMd(3), 0.5);
assert.equal(hoursToActualMd(6), 1);
assert.equal(weekOffsetFromDates('2025-11-07', '2025-11-05'), 0);
assert.equal(weekOffsetFromDates('2025-11-07', '2025-11-12'), 1);
assert.equal(weekOffsetFromDates('2025-11-07', '2025-11-20'), 2);

{
  const drafts = estimateDrafts();
  assert.equal(drafts.find((item) => item.blueprint.id === 'MOCK-ONTIME')?.size, 'S');
  assert.equal(drafts.find((item) => item.blueprint.id === 'MOCK-SLIP')?.size, 'M');
  assert.equal(drafts.find((item) => item.blueprint.id === 'MOCK-XL')?.size, 'XL');
  assert.equal(drafts.find((item) => item.blueprint.id === 'MOCK-SPIKE')?.estimateMd, 0.5);

  const people = filterMockPeople(SEED_PEOPLE);
  assert.deepEqual(
    people.map((person) => person.id).sort(),
    [...MOCK_PERSON_IDS].slice().sort(),
  );

  let tickets = applyEstimates(intakeTickets(), drafts);
  tickets = enterSprint(tickets, MOCK_SPRINT);
  tickets = openRound(tickets, drafts, MOCK_SPRINT);
  assert.ok(tickets.some((item) => item.id === 'MOCK-UNPLANNED' && item.unplanned));
  assert.ok(tickets.every((item) => item.dueOn === MOCK_SPRINT.endOn));

  const assigned = assignFromCapacity(people, tickets);
  tickets = assigned.tickets;
  assert.ok(assigned.skipped.includes('MOCK-XL'), 'XL stays in queue');
  assert.equal(tickets.find((item) => item.id === 'MOCK-XL')?.assigneeId, '');
  assert.ok((tickets.find((item) => item.id === 'MOCK-ONTIME')?.assigneeId ?? '') !== '');

  tickets = applyReturnTags(tickets, MOCK_RETURN_TAGS);
  tickets = settleTickets(tickets);

  const ontime = tickets.find((item) => item.id === 'MOCK-ONTIME');
  const slip = tickets.find((item) => item.id === 'MOCK-SLIP');
  const rework = tickets.find((item) => item.id === 'MOCK-REWORK');
  const spikeTicket = tickets.find((item) => item.id === 'MOCK-SPIKE');
  const unplanned = tickets.find((item) => item.id === 'MOCK-UNPLANNED');
  assert.ok(ontime && slip && rework && spikeTicket && unplanned);
  assert.equal(ontime.actualMd, 0.5);
  assert.equal(ontime.weekOffset, 0);
  assert.equal(scoreTicket(ontime).total, 100);
  assert.equal(slip.weekOffset, 1);
  assert.equal(scoreTicket(slip).total, 80);
  assert.equal(rework.reviewRounds, 3);
  assert.equal(rework.reopenCount, 1);
  assert.equal(scoreTicket(rework).total, 80);
  assert.equal(scoreTicket(spikeTicket).spikeScore, 100);
  assert.equal(unplanned.unplanned, true);
  assert.equal(scoreTicket(unplanned).total, 100);
  assert.equal(MOCK_BLUEPRINTS.length, 6);
}

assignPending
  .then((result) => {
    assert.equal(result.ok, true);
    console.log('verify-scores ok');
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });

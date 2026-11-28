import assert from 'node:assert/strict';
import test from 'node:test';
import { Person, Ticket } from '../../../shared/domain/models';
import {
  answerDeterministic,
  buildDisputeCopilotHeuristic,
  buildRuleBasedBriefing,
  buildScopedSnapshot,
  draftTicketFromBranchHeuristic,
  estimateEffortFromHistory,
  recommendAssigneesForTicket,
} from '../../src/ai/ai-copilot.service';

const samplePeople: Person[] = [
  {
    id: 'p-imp-1',
    nickname: 'ปวีณา',
    fullName: 'ปวีณา ทดสอบ',
    role: 'Implement Dev',
    level: 'Senior',
    track: 'Implement',
    plannedMd: 4.5,
  },
  {
    id: 'p-rd-1',
    nickname: 'ชนะชัย',
    fullName: 'ชนะชัย ทดสอบ',
    role: 'R&D Lead',
    level: 'Senior',
    track: 'RD',
    plannedMd: 4.5,
  },
];

const sampleTickets: Ticket[] = [
  {
    id: 'OP-1001',
    title: 'อัปเกรดระบบ Payroll Export',
    module: 'Payroll',
    track: 'Implement',
    type: 'Feature',
    size: 'M',
    assigneeId: 'p-imp-1',
    estimateMd: 1.5,
    actualMd: 2.5,
    workflowStatus: 'In Progress',
    closed: false,
    closedOn: null,
    workingDaysLeft: 0.5,
    unplanned: false,
    dodPassed: true,
    inTimeBox: true,
    childTicketsSized: true,
    blocker: false,
    varianceCode: 'NONE',
    note: '',
    reviewRounds: 1,
    reopenCount: 0,
    weekOffset: 0,
    firstDueOn: '2026-11-30',
  },
  {
    id: 'OP-1002',
    title: 'ปรับปรุง API Login',
    module: 'Auth',
    track: 'RD',
    type: 'Feature',
    size: 'S',
    assigneeId: 'p-rd-1',
    estimateMd: 0.5,
    actualMd: 0.5,
    workflowStatus: 'Done',
    closed: true,
    closedOn: '2026-11-26',
    workingDaysLeft: null,
    unplanned: false,
    dodPassed: true,
    inTimeBox: true,
    childTicketsSized: true,
    blocker: false,
    varianceCode: 'NONE',
    note: '',
    reviewRounds: 1,
    reopenCount: 0,
    weekOffset: 0,
  },
];

test('ai-copilot: buildScopedSnapshot computes capacity, alerts, and metrics', () => {
  const snap = buildScopedSnapshot(samplePeople, sampleTickets, 'p-imp-1', 1.5);
  assert.equal(snap.metrics.peopleCount, 2);
  assert.equal(snap.metrics.openCount, 1);
  assert.equal(snap.metrics.closedCount, 1);
  assert.ok(snap.alerts.length >= 1, 'should detect deadline/overrun alert');
  assert.equal(snap.capacity[0]?.personId, 'p-rd-1', 'person with 0 open MD should rank first');
  assert.equal(snap.capacity[0]?.freeMd, 4.5);
});

test('ai-copilot: answerDeterministic handles capacity, SLA, ticket lookup, and my-work intents', () => {
  const snap = buildScopedSnapshot(samplePeople, sampleTickets, 'p-imp-1', 1.5);

  const cap = answerDeterministic('สัปดาห์นี้ใครคิวว่างบ้างสาย IMP', snap, 'ปวีณา');
  assert.match(cap.reply, /ปวีณา/);
  assert.match(cap.reply, /ว่าง/);

  const sla = answerDeterministic('ใบงานไหนเสี่ยงเกิน SLA', snap, 'ปวีณา');
  assert.ok(sla.ticketIds.includes('OP-1001'));
  assert.match(sla.reply, /OP-1001/);

  const lookup = answerDeterministic('ขอเช็กสถานะ OP-1001 หน่อย', snap, 'ปวีณา');
  assert.deepEqual(lookup.ticketIds, ['OP-1001']);
  assert.match(lookup.reply, /Payroll Export/);

  const mine = answerDeterministic('สรุปงานของฉันตอนนี้', snap, 'ปวีณา');
  assert.ok(mine.ticketIds.includes('OP-1001'));
  assert.match(mine.reply, /ปวีณา/);
});

test('ai-copilot: buildRuleBasedBriefing produces structured Thai summary', () => {
  const snap = buildScopedSnapshot(samplePeople, sampleTickets, 'p-rd-1', 1.5);
  const briefing = buildRuleBasedBriefing(snap, 'daily');
  assert.match(briefing, /สรุปภาพรวมรายวัน/);
  assert.match(briefing, /OP-1001/);
  assert.match(briefing, /ชนะชัย/);
});

test('ai-copilot: recommendAssigneesForTicket ranks best track + module + capacity fit', () => {
  const recs = recommendAssigneesForTicket(
    {
      ticketId: 'OP-2001',
      title: 'แก้ไขรายงาน Payroll ประจำเดือน',
      module: 'Payroll',
      track: 'Implement',
      estimateMd: 1.0,
    },
    samplePeople,
    sampleTickets,
  );
  assert.equal(recs.length, 2);
  assert.equal(recs[0]?.personId, 'p-imp-1', 'IMP person with Payroll module history should rank #1');
  assert.ok((recs[0]?.matchScore ?? 0) > (recs[1]?.matchScore ?? 0));
  assert.ok(recs[0]?.reasons.some((r) => r.includes('Payroll')));
});

test('ai-copilot: draftTicketFromBranchHeuristic infers type, track, size, and estimateMd', () => {
  const fixDraft = draftTicketFromBranchHeuristic({
    branchName: 'fix/payroll-tax-rounding',
    projectName: 'myHR-Payroll',
    lastCommitTitle: 'Fix tax rounding on 2 decimals',
  });
  assert.equal(fixDraft.type, 'Bug-Fix');
  assert.equal(fixDraft.size, 'S');
  assert.equal(fixDraft.estimateMd, 0.5);
  assert.match(fixDraft.subject, /Fix tax rounding/);

  const spikeDraft = draftTicketFromBranchHeuristic({
    branchName: 'spike/ai-vector-search',
    projectName: 'myTask',
  });
  assert.equal(spikeDraft.type, 'Spike');
  assert.equal(spikeDraft.track, 'RND');
  assert.equal(spikeDraft.estimateMd, 1.0);
});

test('ai-copilot: estimateEffortFromHistory finds similar closed tickets and warns on low estimate', () => {
  const est = estimateEffortFromHistory(
    {
      title: 'ปรับปรุง API Login SSO',
      module: 'Auth',
      track: 'RD',
      currentEstimateMd: 0.2,
    },
    sampleTickets.filter((t) => t.closed),
  );
  assert.equal(est.similarTickets.length, 1);
  assert.equal(est.similarTickets[0]?.id, 'OP-1002');
  assert.equal(est.recommendedMd, 0.5);
  assert.ok(est.warning && est.warning.includes('Overrun'));
});

test('ai-copilot: buildDisputeCopilotHeuristic drafts variance flag and reviews evidence', () => {
  const draft = buildDisputeCopilotHeuristic(
    'draft',
    sampleTickets[0]!,
    'เซิร์ฟเวอร์ staging ล่มตอนทดสอบ deploy 2 วัน',
    'BLK',
    '',
  );
  assert.equal(draft.suggestedFlag, 'ENV');
  assert.match(draft.polishedReason, /OP-1001/);

  const review = buildDisputeCopilotHeuristic(
    'review',
    sampleTickets[0]!,
    '',
    'ENV',
    'เซิร์ฟเวอร์ staging ล่มทำให้ทดสอบไม่ได้ตามกำหนดส่งเดิม',
  );
  assert.equal(review.verdict, 'APPROVE_LIKELY');
  assert.ok(review.evidencePoints.length >= 1);
});

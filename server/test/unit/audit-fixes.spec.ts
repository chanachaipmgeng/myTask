import test from 'node:test';
import assert from 'node:assert/strict';
import type { Person, Ticket } from '../../../shared/domain/models';
import {
  addWorkingDays,
  dueBucketOf,
  fridayOfWeek,
  mondayOfWeek,
  resolvePersonTeamId,
  shiftIsoDay,
} from '../../../shared/domain/work-views';
import { resolvePersonTeamId as resolveTeamVisibilityId } from '../../../shared/domain/team-visibility';
import { calculateNetActualMd, sampleWorkloadPoints, scorePerson } from '../../../shared/domain/scoring';
import { projectedActual } from '../../../shared/domain/alerts';
import { moveWorkflow } from '../../../shared/domain/workflow';
import { parseClosedTicketCsv } from '../../../shared/domain/ticket-file';
import { validateExternalUrl } from '../../src/common/security';
import { TtlCache } from '../../src/common/ttl-cache';

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'T-1',
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
    closed: false,
    dodPassed: false,
    inTimeBox: false,
    childTicketsSized: false,
    unplanned: false,
    assigneeId: 'u1',
    closedOn: null,
    workingDaysLeft: 2,
    note: '',
    ...overrides,
  };
}

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'u1',
    nickname: 'Dev1',
    fullName: 'Dev One',
    role: 'Developer',
    track: 'Implement',
    level: 'Mid',
    plannedMd: 10,
    ...overrides,
  };
}

test('UTC calendar math: shiftIsoDay, mondayOfWeek, fridayOfWeek, addWorkingDays, dueBucketOf', () => {
  assert.equal(shiftIsoDay('2025-11-17', 1), '2025-11-18');
  assert.equal(shiftIsoDay('2025-11-17', -1), '2025-11-16');
  // Monday must stay on the same Monday (previously regressed by -7 days in UTC+7)
  assert.equal(mondayOfWeek('2025-11-17'), '2025-11-17');
  assert.equal(mondayOfWeek('2025-11-19'), '2025-11-17');
  assert.equal(mondayOfWeek('2025-11-23'), '2025-11-17'); // Sunday
  assert.equal(fridayOfWeek('2025-11-17'), '2025-11-21');
  // addWorkingDays skips weekends
  assert.equal(addWorkingDays('2026-11-13', 1), '2026-11-16');
  assert.equal(addWorkingDays('2026-11-13', 2), '2026-11-17');
  // dueBucketOf must accurately emit 'tomorrow'
  const tmr = makeTicket({ dueOn: '2025-11-18' });
  assert.equal(dueBucketOf(tmr, '2025-11-17'), 'tomorrow');
  const today = makeTicket({ dueOn: '2025-11-17' });
  assert.equal(dueBucketOf(today, '2025-11-17'), 'today');
  const overdue = makeTicket({ dueOn: '2025-11-16' });
  assert.equal(dueBucketOf(overdue, '2025-11-17'), 'overdue');
});

test('6-track scoring returns 0 when person has 0 closed tickets (no hardcoded 90-100 baselines)', () => {
  for (const track of ['QA', 'UXBA', 'SUP', 'INFRA', 'IMP', 'RND'] as const) {
    const person = makePerson({ id: `p-${track}`, track });
    const score = scorePerson(person, []);
    assert.equal(score.closedCount, 0);
    assert.equal(score.developmentIndex, 0, `${track} with 0 closed tickets must score 0`);
  }
});

test('6-track sampleWorkloadPoints and CSV import support all 6 canonical tracks', () => {
  const tickets: Ticket[] = [
    makeTicket({ id: 'IMP-1', track: 'IMP', estimateMd: 1 }),
    makeTicket({ id: 'RND-1', track: 'RND', estimateMd: 2 }),
    makeTicket({ id: 'QA-1', track: 'QA', estimateMd: 1.5 }),
    makeTicket({ id: 'UX-1', track: 'UXBA', estimateMd: 1 }),
    makeTicket({ id: 'SUP-1', track: 'SUP', estimateMd: 0.5 }),
    makeTicket({ id: 'INF-1', track: 'INFRA', estimateMd: 2 }),
  ];
  const points = sampleWorkloadPoints(tickets, 'All');
  const totalMd = points.reduce((sum, p) => sum + p.y, 0);
  assert.equal(totalMd, 8);

  const csv = [
    'id,track,type,module,size,estimateMd,actualMd,weekOffset,reviewRounds,blocker,reopenCount,varianceCode,closed,dodPassed,inTimeBox,childTicketsSized,unplanned,assigneeId,closedOn',
    'QA-99,QA,Feature,Auth,M,1,1,0,1,false,0,NONE,true,true,false,false,false,u1,2025-10-30',
    'INF-99,INFRA,Ops,K8s,S,0.5,0.5,0,1,false,0,NONE,true,true,false,false,false,u1,2025-10-30',
  ].join('\n');
  const parsed = parseClosedTicketCsv(csv, ['u1']);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]!.track, 'QA');
  assert.equal(parsed[1]!.track, 'INFRA');
});

test('calculateNetActualMd guards hoursPerMd <= 0 without NaN/Infinity', () => {
  const t = makeTicket({ actualMd: 2, pausedDays: 0.5 });
  const net = calculateNetActualMd(t, 4, 0, 0);
  assert.equal(Number.isFinite(net), true);
  assert.ok(net >= 0);
});

test('projectedActual never shrinks below actualMd when workingDaysLeft is negative', () => {
  const overdue = makeTicket({ actualMd: 3, workingDaysLeft: -2 });
  const proj = projectedActual(overdue);
  assert.ok(proj !== null && proj >= overdue.actualMd, `projected ${proj} must be >= actualMd ${overdue.actualMd}`);
});

test('moveWorkflow reopening a Done ticket resets closed and closedOn and normalizes ISO timestamps', () => {
  const doneTicket = makeTicket({
    workflowStatus: 'Done',
    closed: true,
    closedOn: '2025-11-10',
    storyPoints: 3,
    firstDueOn: '2025-11-12',
    reopenCount: 0,
  });
  const res = moveWorkflow(doneTicket, 'In Progress', '2025-11-15');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.ticket.closed, false);
    assert.equal(res.ticket.closedOn, null);
  }

  // ISO timestamp normalization in weekOffsetFromDelivery when moving to Ready for QA
  const inReview = makeTicket({
    workflowStatus: 'Code Review',
    storyPoints: 3,
    firstDueOn: '2025-11-17T10:30:00.000Z',
    mrLink: 'https://gitlab.example.com/mr/1',
  });
  const qaRes = moveWorkflow(inReview, 'Ready for QA', '2025-11-17');
  assert.equal(qaRes.ok, true);
  if (qaRes.ok) {
    assert.equal(qaRes.ticket.weekOffset, 0);
  }
});

test('resolvePersonTeamId parity between work-views and team-visibility', () => {
  const p1 = makePerson({ teamId: 'dev-a', department: 'dev-b' });
  assert.equal(resolvePersonTeamId(p1), resolveTeamVisibilityId(p1));
  assert.equal(resolvePersonTeamId(p1), 'dev-a');

  const p2 = makePerson({ teamId: undefined, department: 'dept-x' });
  assert.equal(resolvePersonTeamId(p2), resolveTeamVisibilityId(p2));
  assert.equal(resolvePersonTeamId(p2), 'dept-x');
});

test('validateExternalUrl blocks 127.0.0.0/8 and IPv4-mapped IPv6 loopback in production', () => {
  assert.throws(() => validateExternalUrl('https://127.0.0.2/api', { production: true }));
  assert.throws(() => validateExternalUrl('https://[::ffff:127.0.0.1]/api', { production: true }));
  assert.throws(() => validateExternalUrl('https://169.254.169.254/latest', { production: true }));
  assert.equal(validateExternalUrl('https://gitlab.example.com/api', { production: true }), 'https://gitlab.example.com/api');
});

test('TtlCache.clear removes all cached entries', () => {
  const cache = new TtlCache<number>(60_000, 10);
  cache.set('a', 1);
  cache.set('b', 2);
  assert.equal(cache.get('a'), 1);
  cache.clear();
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('b'), undefined);
});

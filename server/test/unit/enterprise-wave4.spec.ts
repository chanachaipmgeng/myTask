import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import { collectAlerts } from '../../../shared/domain/alerts';
import { normalizeTrack, Ticket, trackDisplayLabel } from '../../../shared/domain/models';
import { accuracyBand, calculateNetActualMd, scoreTicket } from '../../../shared/domain/scoring';
import { computeEffectiveAllowedTeams, isTeamAllowed } from '../../../shared/domain/team-visibility';
import { addWorkingDays } from '../../../shared/domain/work-views';
import { moveWorkflow } from '../../../shared/domain/workflow';
import {
  getRequestId,
  getRuntimeMetricsSnapshot,
  requestObservabilityMiddleware,
  resetMetricsForTest,
  sanitizeRequestId,
} from '../../src/common/observability';

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'T-WAVE4',
    track: 'IMP',
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
    dodPassed: true,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'u-1',
    closedOn: '2026-11-10',
    workingDaysLeft: null,
    note: '',
    ...overrides,
  };
}

describe('Wave 4 Enterprise Contracts', () => {
  it('enforces Tiered Tolerance Accuracy across XS/S, M, and L/XL', () => {
    // XS/S [0.5, 2.0] => ratio 1.8 gets full 20
    assert.equal(accuracyBand(1.8, 'S').points, 20);
    assert.equal(accuracyBand(1.8, 'S').inBand, true);

    // M [0.8, 1.5] => ratio 1.8 drops to partial 10
    assert.equal(accuracyBand(1.8, 'M').points, 10);
    assert.equal(accuracyBand(1.8, 'M').inBand, false);

    // L/XL [0.85, 1.3] => ratio 1.4 drops to partial 10, while 1.25 is full 20
    assert.equal(accuracyBand(1.4, 'L').points, 10);
    assert.equal(accuracyBand(1.25, 'XL').points, 20);
  });

  it('applies Fair Cutoff when moving to Ready for QA before QA finishes late', () => {
    const devTicket = makeTicket({
      closed: false,
      closedOn: null,
      workflowStatus: 'Code Review',
      storyPoints: 3,
      firstDueOn: '2026-11-10',
      mrLink: 'https://git.example.com/mr/42',
      weekOffset: 2,
    });
    const toQa = moveWorkflow(devTicket, 'Ready for QA', '2026-11-09');
    assert.equal(toQa.ok, true);
    assert.equal(toQa.ticket?.readyForQaAt, '2026-11-09');
    assert.equal(toQa.ticket?.devDeliveredOn, '2026-11-09');
    assert.equal(toQa.ticket?.weekOffset, 0);

    // Even if Done happens 14 days later, devDeliveredOn stays 2026-11-09 so weekOffset remains 0
    const toDone = moveWorkflow(toQa.ticket!, 'Done', '2026-11-24');
    assert.equal(toDone.ok, true);
    assert.equal(toDone.ticket?.weekOffset, 0);
    const scored = scoreTicket(toDone.ticket!);
    assert.equal(scored.week, 40);
    assert.equal(scored.total, 100);
  });

  it('protects paused MD Mandate resume tickets and deducts pausedDays from Net Actual MD', () => {
    const t = makeTicket({
      estimateMd: 1,
      actualMd: 3,
      pausedDays: 2,
      isPaused: false,
      weekOffset: 1,
    });
    assert.equal(calculateNetActualMd(t), 1);
    const scored = scoreTicket(t);
    assert.equal(scored.exempt, true);
    assert.equal(scored.week, 40);
    assert.equal(scored.accuracy, 20);
    assert.equal(scored.total, 100);
  });

  it('adds working days skipping weekends for addWorkingDays', () => {
    // 2026-11-27 is Friday -> +1 working day is Monday 2026-11-30
    assert.equal(addWorkingDays('2026-11-27', 1), '2026-11-30');
    // +3 working days from Friday -> Wednesday 2026-12-02
    assert.equal(addWorkingDays('2026-11-27', 3), '2026-12-02');
  });

  it('normalizes 6 dynamic tracks and legacy aliases consistently', () => {
    assert.equal(normalizeTrack('Implement'), 'IMP');
    assert.equal(normalizeTrack('IMP'), 'IMP');
    assert.equal(normalizeTrack('RD'), 'RND');
    assert.equal(normalizeTrack('RND'), 'RND');
    assert.equal(normalizeTrack('QA'), 'QA');
    assert.equal(normalizeTrack('UXBA'), 'UXBA');
    assert.equal(normalizeTrack('SUP'), 'SUP');
    assert.equal(normalizeTrack('INFRA'), 'INFRA');
    assert.equal(trackDisplayLabel('RD'), 'R&D (FE / BE / AI)');
  });

  it('computes team visibility matrix and user overrides correctly', () => {
    const config = {
      matrix: [{ sourceTeamId: 'team-rnd', targetTeamId: 'team-qa' }],
      userOverrides: { 'lead-1': ['team-imp'] },
    };
    assert.equal(
      computeEffectiveAllowedTeams({ id: 'adm-1', access: 'admin', teamId: 'team-rnd' }, config),
      null,
    );
    const allowed = computeEffectiveAllowedTeams(
      { id: 'lead-1', access: 'lead', teamId: 'team-rnd' },
      config,
    );
    assert.deepEqual(allowed?.sort(), ['team-imp', 'team-qa', 'team-rnd']);
    assert.equal(isTeamAllowed(allowed, 'team-qa'), true);
    assert.equal(isTeamAllowed(allowed, 'team-infra'), false);
    assert.equal(isTeamAllowed(null, 'team-infra'), true);
  });

  it('collects all 4 alert kinds cleanly', () => {
    const tickets = [
      makeTicket({
        id: 'A-SLA',
        closed: false,
        closedOn: null,
        policyDate: '2026-11-20',
        alertDate: '2026-11-18',
        replyDate: null,
        workingDaysLeft: 2,
      }),
      makeTicket({
        id: 'A-ALERT',
        closed: false,
        closedOn: null,
        policyDate: '2026-11-28',
        alertDate: '2026-11-25',
        replyDate: null,
        workingDaysLeft: 0.5,
        actualMd: 4,
        estimateMd: 1,
      }),
    ];
    const alerts = collectAlerts(tickets, 1.5, '2026-11-25');
    const kinds = new Set(alerts.map((a) => a.kind));
    assert.ok(kinds.has('policy-breach'));
    assert.ok(kinds.has('policy-alert'));
    assert.ok(kinds.has('deadline'));
    assert.ok(kinds.has('overrun'));
  });

  it('sanitizes request IDs and records observability metrics cleanly', () => {
    resetMetricsForTest();
    assert.equal(sanitizeRequestId('req-123_ABC.1'), 'req-123_ABC.1');
    assert.equal(sanitizeRequestId('bad\r\nid'), null);
    assert.equal(sanitizeRequestId('a'.repeat(65)), null);

    const mw = requestObservabilityMiddleware(false);

    // Client-provided valid X-Request-Id is preserved
    const req1 = { method: 'GET', path: '/api/tickets', headers: { 'x-request-id': 'client-trace-01' } } as unknown as Request;
    const headers1 = new Map<string, string>();
    const res1 = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setHeader: (k: string, v: string) => headers1.set(k.toLowerCase(), v),
    }) as unknown as Response & EventEmitter;
    let called1 = false;
    mw(req1, res1, () => {
      called1 = true;
    });
    assert.equal(called1, true);
    assert.equal(getRequestId(req1), 'client-trace-01');
    assert.equal(headers1.get('x-request-id'), 'client-trace-01');
    res1.emit('finish');

    // Invalid X-Request-Id falls back to UUID and records 5xx error route
    const req2 = { method: 'POST', path: '/api/fail?token=secret', headers: { 'x-request-id': 'bad\nvalue' } } as unknown as Request;
    const headers2 = new Map<string, string>();
    const res2 = Object.assign(new EventEmitter(), {
      statusCode: 500,
      setHeader: (k: string, v: string) => headers2.set(k.toLowerCase(), v),
    }) as unknown as Response & EventEmitter;
    mw(req2, res2, () => undefined);
    assert.match(getRequestId(req2), /^[0-9a-f-]{36}$/i);
    res2.emit('finish');

    const snapshot = getRuntimeMetricsSnapshot();
    assert.equal(snapshot.http.totalRequests, 2);
    assert.equal(snapshot.http.statusBuckets['2xx'], 1);
    assert.equal(snapshot.http.statusBuckets['5xx'], 1);
    assert.equal(snapshot.http.errorRoutes[0]?.route, 'POST /api/fail');
    assert.equal(snapshot.http.errorRoutes[0]?.count, 1);
  });
});

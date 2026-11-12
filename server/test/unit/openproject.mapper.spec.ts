import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_OPENPROJECT_MAPPING,
  countReopens,
  isoDurationToHours,
  mapWorkPackage,
  sizeFromEstimate,
  validateMapping,
  weekOffset,
  workingDaysBetween,
  type MapContext,
  type OpWorkPackage,
} from '../../src/integrations/openproject/openproject.mapper';
import { Ticket } from '../../../shared/domain/models';

describe('isoDurationToHours', () => {
  it('parses hours and fractional hours', () => {
    assert.equal(isoDurationToHours('PT8H'), 8);
    assert.equal(isoDurationToHours('PT0.5H'), 0.5);
    assert.equal(isoDurationToHours('PT1H30M'), 1.5);
  });

  it('treats P1D as 24 hours', () => {
    assert.equal(isoDurationToHours('P1D'), 24);
    assert.equal(isoDurationToHours('P1DT2H'), 26);
  });
});

describe('sizeFromEstimate', () => {
  it('maps man-days to size buckets', () => {
    assert.equal(sizeFromEstimate(0.25), 'XS');
    assert.equal(sizeFromEstimate(0.5), 'S');
    assert.equal(sizeFromEstimate(1), 'M');
    assert.equal(sizeFromEstimate(2), 'L');
    assert.equal(sizeFromEstimate(5), 'XL');
  });
});

describe('mapWorkPackage', () => {
  const baseCtx = (): MapContext => ({
    mapping: DEFAULT_OPENPROJECT_MAPPING,
    hoursPerMd: 6,
    personByOpUser: new Map([[10, 'itsara']]),
    spentHours: new Map([[100, 12]]),
    today: '2026-11-12',
  });

  const sampleWp = (): OpWorkPackage => ({
    id: 100,
    subject: 'Fix login',
    estimatedTime: 'PT6H',
    dueDate: '2026-11-20',
    updatedAt: '2026-11-10T10:00:00Z',
    _links: {
      status: { href: '/api/v3/statuses/1', title: 'In progress' },
      type: { href: '/api/v3/types/1', title: 'Bug' },
      project: { href: '/api/v3/projects/demo', title: 'Demo' },
      assignee: { href: '/api/v3/users/10', title: 'Itsara' },
      category: { href: '/api/v3/categories/1', title: 'Auth' },
    },
  });

  it('maps estimate/actual MD, status, type, and assignee', () => {
    const ticket = mapWorkPackage(sampleWp(), baseCtx());
    assert.equal(ticket.id, 'OP-100');
    assert.equal(ticket.estimateMd, 1);
    assert.equal(ticket.actualMd, 2);
    assert.equal(ticket.workflowStatus, 'In Progress');
    assert.equal(ticket.type, 'Bug-Fix');
    assert.equal(ticket.assigneeId, 'itsara');
    assert.equal(ticket.module, 'Auth');
    assert.equal(ticket.source, 'openproject');
  });

  it('keeps local-only fields on resync', () => {
    const existing: Ticket = {
      id: 'OP-100',
      track: 'Implement',
      type: 'Bug-Fix',
      module: 'Auth',
      size: 'S',
      estimateMd: 1,
      actualMd: 1,
      weekOffset: 0,
      reviewRounds: 3,
      blocker: false,
      reopenCount: 0,
      varianceCode: 'NONE',
      closed: false,
      dodPassed: false,
      inTimeBox: false,
      childTicketsSized: false,
      unplanned: false,
      assigneeId: 'itsara',
      closedOn: null,
      workingDaysLeft: 4,
      note: 'local note',
      mrLink: 'https://gitlab.example/mr/1',
      source: 'openproject',
      opId: 100,
      firstDueOn: '2026-11-18',
    };
    const ticket = mapWorkPackage(sampleWp(), { ...baseCtx(), existing });
    assert.equal(ticket.reviewRounds, 3);
    assert.equal(ticket.note, 'local note');
    assert.equal(ticket.mrLink, 'https://gitlab.example/mr/1');
    assert.equal(ticket.firstDueOn, '2026-11-18');
    assert.equal(ticket.estimateMd, 1);
    assert.equal(ticket.actualMd, 2);
  });

  it('reads custom fields when configured', () => {
    const mapping = {
      ...DEFAULT_OPENPROJECT_MAPPING,
      customFields: {
        ...DEFAULT_OPENPROJECT_MAPPING.customFields,
        size: 'customField3',
        track: 'customField4',
      },
    };
    const wp: OpWorkPackage = {
      ...sampleWp(),
      customField3: 'L',
      customField4: 'RD',
    };
    const ticket = mapWorkPackage(wp, { ...baseCtx(), mapping });
    assert.equal(ticket.size, 'L');
    assert.equal(ticket.track, 'RD');
  });
});

describe('countReopens', () => {
  it('counts Done to non-Done transitions', () => {
    const count = countReopens(
      [
        { createdAt: '2026-01-01T00:00:00Z', details: [{ raw: 'Status changed from New to Closed' }] },
        { createdAt: '2026-01-02T00:00:00Z', details: [{ raw: 'Status changed from Closed to In progress' }] },
        { createdAt: '2026-01-03T00:00:00Z', details: [{ raw: 'Status changed from In progress to Done' }] },
        { createdAt: '2026-01-04T00:00:00Z', details: [{ raw: 'Status changed from Done to Reopened' }] },
      ],
      DEFAULT_OPENPROJECT_MAPPING,
    );
    assert.equal(count, 2);
  });
});

describe('weekOffset and workingDaysBetween', () => {
  it('computes week slip and working days', () => {
    assert.equal(weekOffset('2026-11-10', '2026-11-20'), 1);
    assert.equal(workingDaysBetween('2026-11-12', '2026-11-16'), 2);
  });
});

describe('validateMapping', () => {
  it('rejects unknown workflow statuses', () => {
    const result = validateMapping({
      ...DEFAULT_OPENPROJECT_MAPPING,
      statusMap: { Weird: 'NotAStatus' },
    });
    assert.equal(result.mapping, null);
    assert.ok(result.errors.length > 0);
  });

  it('accepts the default mapping', () => {
    const result = validateMapping(DEFAULT_OPENPROJECT_MAPPING);
    assert.ok(result.mapping);
    assert.equal(result.errors.length, 0);
  });
});

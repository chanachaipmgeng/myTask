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

  it('maps _links.parent to opParentId and parentId', () => {
    const wpWithParent: OpWorkPackage = {
      ...sampleWp(),
      _links: {
        ...sampleWp()._links,
        parent: { href: '/api/v3/work_packages/42', title: 'Parent Epic' },
      },
    };
    const ticket = mapWorkPackage(wpWithParent, baseCtx());
    assert.equal(ticket.opParentId, 42);
    assert.equal(ticket.parentId, 'OP-42');
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

  it('locks firstDueOn when OpenProject dueDate changes', () => {
    const existing: Ticket = {
      id: 'OP-100',
      track: 'Implement',
      type: 'Bug-Fix',
      module: 'Auth',
      size: 'S',
      estimateMd: 1,
      actualMd: 1,
      weekOffset: 0,
      reviewRounds: 0,
      blocker: false,
      reopenCount: 0,
      varianceCode: 'NONE',
      closed: true,
      dodPassed: true,
      inTimeBox: false,
      childTicketsSized: false,
      unplanned: false,
      assigneeId: 'itsara',
      closedOn: '2026-11-27',
      workingDaysLeft: null,
      note: '',
      source: 'openproject',
      opId: 100,
      firstDueOn: '2026-11-13',
      dueOn: '2026-11-13',
    };
    const wp: OpWorkPackage = {
      ...sampleWp(),
      dueDate: '2026-11-27',
      updatedAt: '2026-11-27T10:00:00Z',
      _links: {
        ...sampleWp()._links,
        status: { href: '/api/v3/statuses/9', title: 'Closed' },
      },
      _embedded: { status: { name: 'Closed', isClosed: true } },
    };
    const ticket = mapWorkPackage(wp, { ...baseCtx(), existing, today: '2026-11-27' });
    assert.equal(ticket.firstDueOn, '2026-11-13');
    assert.equal(ticket.dueOn, '2026-11-27');
    assert.equal(ticket.weekOffset, weekOffset('2026-11-13', '2026-11-27'));
    assert.ok((ticket.weekOffset ?? 0) >= 1);
  });

  it('reads custom fields when configured', () => {
    const mapping = {
      ...DEFAULT_OPENPROJECT_MAPPING,
      customFields: {
        ...DEFAULT_OPENPROJECT_MAPPING.customFields,
        size: 'customField3',
        track: 'customField4',
        workCategory: 'customField5',
        reviewRounds: 'customField6',
        blocker: 'customField7',
        storyPoints: 'customField8',
        discipline: 'customField9',
        mrLink: 'customField10',
        weekOffset: 'customField11',
      },
    };
    const wp: OpWorkPackage = {
      ...sampleWp(),
      startDate: '2026-11-05',
      customField3: 'L',
      customField4: 'RD',
      customField5: 'BugInternal',
      customField6: '2',
      customField7: 'true',
      customField8: '5',
      customField9: 'BE',
      customField10: 'https://gitlab.example/mr/9',
      customField11: '1',
      _embedded: { status: { name: 'Closed', isClosed: true } },
      _links: {
        ...sampleWp()._links,
        status: { href: '/api/v3/statuses/9', title: 'Closed' },
      },
    };
    const ticket = mapWorkPackage(wp, { ...baseCtx(), mapping });
    assert.equal(ticket.size, 'L');
    assert.equal(ticket.track, 'RD');
    assert.equal(ticket.workCategory, 'BugInternal');
    assert.equal(ticket.reviewRounds, 2);
    assert.equal(ticket.blocker, true);
    assert.equal(ticket.storyPoints, 5);
    assert.equal(ticket.discipline, 'BE');
    assert.equal(ticket.mrLink, 'https://gitlab.example/mr/9');
    assert.equal(ticket.weekOffset, 1);
    assert.equal(ticket.actualStartOn, '2026-11-05');
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

  it('counts reopen transitions from Thai status titles', () => {
    const count = countReopens(
      [
        { createdAt: '2026-01-01T00:00:00Z', details: [{ raw: 'Status changed from ใหม่ to ปิด' }] },
        { createdAt: '2026-01-02T00:00:00Z', details: [{ raw: 'Status changed from ปิด to กำลังทำ' }] },
        { createdAt: '2026-01-03T00:00:00Z', details: [{ raw: 'Status changed from กำลังทำ to เสร็จสิ้น' }] },
        { createdAt: '2026-01-04T00:00:00Z', details: [{ raw: 'Status changed from เสร็จสิ้น to เปิดใหม่' }] },
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

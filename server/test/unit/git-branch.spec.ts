import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseTicketIdFromBranch,
  suggestBranchNameFromTicket,
  slugifyTicketTitle,
} from '../../../shared/domain/git-branch';

describe('suggestBranchNameFromTicket', () => {
  it('round-trips opId through parseTicketIdFromBranch', () => {
    const name = suggestBranchNameFromTicket({
      opId: 73306,
      title: 'Migrate Bootstrap 3.5 Security',
      type: 'Feature',
    });
    assert.equal(name, 'feat/OP-73306-migrate-bootstrap-3-5-security');
    assert.equal(parseTicketIdFromBranch(name), '73306');
  });

  it('uses bug prefix for defect types', () => {
    const name = suggestBranchNameFromTicket({
      opId: 9988,
      title: 'Login SSO failure',
      type: 'DEV-Bugs Fix',
    });
    assert.equal(name, 'bug/OP-9988-login-sso-failure');
    assert.equal(parseTicketIdFromBranch(name), '9988');
  });

  it('uses spike prefix for research / AI types', () => {
    const name = suggestBranchNameFromTicket({
      opId: 42,
      title: 'AI prompt optimization',
      type: 'Spike',
    });
    assert.equal(name, 'spike/OP-42-ai-prompt-optimization');
    assert.equal(parseTicketIdFromBranch(name), '42');
  });

  it('omits empty slug when title has no latin characters', () => {
    const name = suggestBranchNameFromTicket({
      opId: 100,
      title: 'ปรับปรุงระบบลา',
      type: 'Implement',
    });
    assert.equal(name, 'feat/OP-100');
    assert.equal(parseTicketIdFromBranch(name), '100');
  });

  it('throws without opId', () => {
    assert.throws(() => suggestBranchNameFromTicket({ opId: '', title: 'x' }), /opId/);
  });
});

describe('slugifyTicketTitle', () => {
  it('truncates near 40 chars on word boundary hyphens', () => {
    const slug = slugifyTicketTitle(
      'This is a very long ticket title that should be truncated somehow',
    );
    assert.ok(slug.length <= 40);
    assert.ok(!slug.endsWith('-'));
  });
});

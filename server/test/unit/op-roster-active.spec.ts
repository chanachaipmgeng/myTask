import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveSyncUserActive } from '../../../shared/domain/op-team-staging';

describe('resolveSyncUserActive (roster groups)', () => {
  it('when roster groups set: only in-group non-locked are active', () => {
    assert.equal(
      resolveSyncUserActive({
        locked: false,
        useRosterGroups: true,
        inRoster: true,
        staging: 'all',
        isRd: false,
      }),
      true,
    );
    assert.equal(
      resolveSyncUserActive({
        locked: false,
        useRosterGroups: true,
        inRoster: false,
        staging: 'all',
        isRd: true,
      }),
      false,
    );
    assert.equal(
      resolveSyncUserActive({
        locked: true,
        useRosterGroups: true,
        inRoster: true,
        staging: 'all',
        isRd: true,
      }),
      false,
    );
  });

  it('when roster empty: falls back to staging rules', () => {
    assert.equal(
      resolveSyncUserActive({
        locked: false,
        useRosterGroups: false,
        inRoster: false,
        staging: 'all',
        isRd: false,
      }),
      true,
    );
    assert.equal(
      resolveSyncUserActive({
        locked: false,
        useRosterGroups: false,
        inRoster: false,
        staging: 'rd',
        isRd: false,
      }),
      false,
    );
    assert.equal(
      resolveSyncUserActive({
        locked: false,
        useRosterGroups: false,
        inRoster: false,
        staging: 'rd',
        isRd: true,
      }),
      true,
    );
  });
});

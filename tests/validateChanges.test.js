// Tests for _validateChanges in lambda/GeneratePresignedPost.js — the
// tombstone-aware authorization rules for gameNights.json writes.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _validateChanges } = require('../lambda/GeneratePresignedPost.js');

const live = (id, host, extra = {}) => ({
  id, hostUserId: host, lastModified: 1000, date: '2026-08-07',
  selectedGames: {}, ...extra,
});
const dead = (id, host) => ({ id, hostUserId: host, deleted: true, lastModified: 2000 });

describe('_validateChanges — new nights', () => {
  it('accepts a new night hosted by the caller', () => {
    const { error, accepted } = _validateChanges([], [live('n1', 'alice')], 'alice');
    expect(error).toBeUndefined();
    expect(accepted).toHaveLength(1);
  });

  it('silently drops unknown nights hosted by someone else (resurrection attempts)', () => {
    const { error, accepted } = _validateChanges([], [live('zombie', 'alice')], 'bob');
    expect(error).toBeUndefined();
    expect(accepted).toHaveLength(0);
  });
});

describe('_validateChanges — tombstones', () => {
  it('lets the host delete via tombstone', () => {
    const { error, accepted } = _validateChanges([live('n1', 'alice')], [dead('n1', 'alice')], 'alice');
    expect(error).toBeUndefined();
    expect(accepted[0].deleted).toBe(true);
  });

  it('rejects a non-host deleting via tombstone', () => {
    const { error } = _validateChanges([live('n1', 'alice')], [dead('n1', 'alice')], 'bob');
    expect(error).toMatch(/Only the host can delete/);
  });

  it('rejects a non-host resurrecting a tombstoned night', () => {
    const { error } = _validateChanges([dead('n1', 'alice')], [live('n1', 'alice')], 'bob');
    expect(error).toMatch(/Only the host can restore/);
  });

  it('accepts a non-host passing an existing tombstone through unchanged', () => {
    const { error, accepted } = _validateChanges([dead('n1', 'alice')], [dead('n1', 'alice')], 'bob');
    expect(error).toBeUndefined();
    expect(accepted[0].deleted).toBe(true);
  });

  it('carries a tombstone forward when a client omits it', () => {
    const { error, accepted } = _validateChanges(
      [dead('gone', 'alice'), live('n2', 'alice')],
      [live('n2', 'alice', { rsvps: [{ userId: 'bob' }] })],
      'bob',
    );
    expect(error).toBeUndefined();
    expect(accepted.find(n => n.id === 'gone')?.deleted).toBe(true);
  });

  it('converts a host deletion-by-omission into a tombstone (legacy clients)', () => {
    const { error, accepted } = _validateChanges([live('n1', 'alice')], [], 'alice');
    expect(error).toBeUndefined();
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ id: 'n1', deleted: true });
  });

  it('still rejects a non-host deleting by omission', () => {
    const { error } = _validateChanges([live('n1', 'alice')], [], 'bob');
    expect(error).toMatch(/Only the host can delete/);
  });
});

describe('_validateChanges — existing rules preserved', () => {
  it('rejects changing hostUserId', () => {
    const { error } = _validateChanges([live('n1', 'alice')], [live('n1', 'mallory')], 'mallory');
    expect(error).toMatch(/Cannot change hostUserId/);
  });

  it('rejects a non-host changing a host-only field', () => {
    const { error } = _validateChanges(
      [live('n1', 'alice')],
      [live('n1', 'alice', { date: '2026-09-01' })],
      'bob',
    );
    expect(error).toMatch(/Only the host can change "date"/);
  });

  it('allows a non-host updating invited/rsvps', () => {
    const { error } = _validateChanges(
      [live('n1', 'alice', { invited: ['bob@x.com'] })],
      [live('n1', 'alice', { invited: [], rsvps: [{ userId: 'bob' }] })],
      'bob',
    );
    expect(error).toBeUndefined();
  });

  it('rejects a non-host adding a game', () => {
    const { error } = _validateChanges(
      [live('n1', 'alice')],
      [live('n1', 'alice', { selectedGames: { g1: { maxPlayers: 4 } } })],
      'bob',
    );
    expect(error).toMatch(/Only the host can add or remove games/);
  });
});

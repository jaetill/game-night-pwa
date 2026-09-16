// Tests for _validateChanges in lambda/GeneratePresignedPost.js — the
// tombstone-aware authorization rules for gameNights.json writes.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _validateChanges } = require('../lambda/GeneratePresignedPost.js');
const { newGuest } = require('../lambda/lib/guests.js');

const bobPending  = () => newGuest({ id: 'g-bob', userId: 'bob', invitedBy: 'alice', invitedAt: 1, response: null });
const bobPlaying  = () => newGuest({ id: 'g-bob', userId: 'bob', invitedBy: 'alice', invitedAt: 1, response: { type: 'playing', at: 2 } });

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
      [dead('gone', 'alice'), live('n2', 'alice', { guests: [bobPending()] })],
      [live('n2', 'alice', { guests: [bobPlaying()] })],
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

  it('allows a non-host changing their own response', () => {
    const { error } = _validateChanges(
      [live('n1', 'alice', { guests: [bobPending()] })],
      [live('n1', 'alice', { guests: [bobPlaying()] })],
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

describe('_validateChanges — guests[] (ADR-0021)', () => {
  it('normalizes legacy arrays on both sides so an unchanged legacy night is not a diff', () => {
    const legacy = () => live('n1', 'alice', {
      invited: ['carol@x.com'], rsvps: [{ userId: 'bob', name: 'Bob', type: 'playing' }], declined: ['dan'],
    });
    const { error, accepted } = _validateChanges([legacy()], [legacy()], 'bob');
    expect(error).toBeUndefined();
    expect(accepted[0].guests).toHaveLength(3);
    expect(accepted[0].invited).toBeUndefined();
    expect(accepted[0].rsvps).toBeUndefined();
    expect(accepted[0].declined).toBeUndefined();
  });

  it('lets a non-host respond on a legacy night (deterministic ids line up)', () => {
    const before = live('n1', 'alice', { invited: ['bob'] });
    const after  = live('n1', 'alice', { guests: [newGuest({ id: 'legacy-bob', userId: 'bob', invitedBy: 'alice', invitedAt: 1000, response: { type: 'playing', at: 5 } })] });
    const { error } = _validateChanges([before], [after], 'bob');
    expect(error).toBeUndefined();
  });

  it('keeps the server copy of other guests when a non-host uploads a stale or tampered list', () => {
    const carol = newGuest({ id: 'g-c', userId: 'carol', invitedBy: 'alice', invitedAt: 1, response: { type: 'any_game', at: 2 } });
    const before = live('n1', 'alice', { guests: [bobPending(), carol] });
    const after  = live('n1', 'alice', { guests: [bobPlaying(), { ...carol, response: { type: 'declined', at: 3 } }] });
    const { error, accepted } = _validateChanges([before], [after], 'bob');
    expect(error).toBeUndefined();
    expect(accepted[0].guests.find(g => g.id === 'g-c').response.type).toBe('any_game');
    expect(accepted[0].guests.find(g => g.id === 'g-bob').response.type).toBe('playing');

    const dropped = live('n1', 'alice', { guests: [bobPlaying()] });
    expect(_validateChanges([before], [dropped], 'bob').accepted[0].guests.map(g => g.id)).toEqual(['g-bob', 'g-c']);
  });

  it('rejects a non-host adding themselves to a night they were not invited to', () => {
    const before = live('n1', 'alice', { guests: [] });
    const after  = live('n1', 'alice', { guests: [bobPlaying()] });
    expect(_validateChanges([before], [after], 'bob').error).toMatch(/not on the guest list/);
  });

  it('lets an attending guest bring a plus-one, and lets the host do anything', () => {
    const plus = newGuest({ id: 'p1', invitedBy: 'bob', invitedAt: 3, response: { type: 'if_needed', at: 3 } });
    const before = live('n1', 'alice', { guests: [bobPlaying()] });
    const after  = live('n1', 'alice', { guests: [bobPlaying(), plus] });
    expect(_validateChanges([before], [after], 'bob').error).toBeUndefined();
    expect(_validateChanges([after], [live('n1', 'alice', { guests: [] })], 'alice').error).toBeUndefined();
  });
  it('lets an email invitee claim their entry only when the authorizer-verified email matches', () => {
    const before = live('n1', 'alice', { guests: [newGuest({ id: 'e', email: 'bob@x.com', invitedBy: 'alice', invitedAt: 1 })] });
    const after  = live('n1', 'alice', { guests: [newGuest({ id: 'e', userId: 'bob', email: 'bob@x.com', invitedBy: 'alice', invitedAt: 1, response: { type: 'playing', at: 2 } })] });
    expect(_validateChanges([before], [after], 'bob', 'bob@x.com').accepted[0].guests[0].userId).toBe('bob');
    expect(_validateChanges([before], [after], 'bob').error).toMatch(/not on the guest list/);
    expect(_validateChanges([before], [after], 'bob', 'mallory@x.com').error).toMatch(/not on the guest list/);
  });
});

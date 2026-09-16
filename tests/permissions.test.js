import { describe, it, expect } from 'vitest';
import { isHost, getUserNightRole } from '../src/js/auth/permissions.js';

const alice = { userId: 'u-alice', name: 'Alice' };
const bob   = { userId: 'u-bob',   name: 'Bob' };

function makeNight(overrides = {}) {
  return {
    id: 'n1',
    hostUserId: alice.userId,
    rsvps: [],
    invited: [],
    ...overrides
  };
}

describe('isHost', () => {
  it('returns true when user is the host', () => {
    expect(isHost(alice, makeNight())).toBe(true);
  });

  it('returns false when user is not the host', () => {
    expect(isHost(bob, makeNight())).toBe(false);
  });

  it('returns false for null user', () => {
    expect(isHost(null, makeNight())).toBe(false);
  });

  it('returns false when user has no userId', () => {
    expect(isHost({ name: 'Anon' }, makeNight())).toBe(false);
  });
});

describe('getUserNightRole', () => {
  it('returns Host for the host user', () => {
    expect(getUserNightRole(makeNight(), alice)).toBe('Host');
  });

  it('returns Invited when user is on the guest list without a response', () => {
    const night = makeNight({ guests: [{ id: 'g', userId: bob.userId, response: null }] });
    expect(getUserNightRole(night, bob)).toBe('Invited');
  });

  it('returns RSVP’d for a yes-type response and null for a decline', () => {
    expect(getUserNightRole(makeNight({ guests: [{ id: 'g', userId: bob.userId, response: { type: 'if_needed', at: 1 } }] }), bob)).toBe('RSVP’d');
    expect(getUserNightRole(makeNight({ guests: [{ id: 'g', userId: bob.userId, response: { type: 'declined', at: 1 } }] }), bob)).toBeNull();
  });

  it('returns null when user has no connection to the night', () => {
    expect(getUserNightRole(makeNight(), bob)).toBeNull();
  });

  it('returns null for null user', () => {
    expect(getUserNightRole(makeNight(), null)).toBeNull();
  });
});

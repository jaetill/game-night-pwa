import { describe, it, expect } from 'vitest';
import { _diffRsvpEvents } from '../lambda/GeneratePresignedPost.js';

const HOST = 'host-1';
const GUEST = 'guest-1';

function night(overrides = {}) {
  return {
    id: 'n1',
    hostUserId: HOST,
    date: '2026-08-21',
    rsvps: [],
    declined: [],
    ...overrides,
  };
}

describe('diffRsvpEvents', () => {
  it('reports a new RSVP by the actor to the host', () => {
    const current  = [night()];
    const accepted = [night({ rsvps: [{ userId: GUEST, name: 'Deb', type: 'playing' }] })];
    const events = _diffRsvpEvents(current, accepted, GUEST);
    expect(events).toHaveLength(1);
    expect(events[0].hostUserId).toBe(HOST);
    expect(events[0].body).toBe('Deb is in');
  });

  it('labels each RSVP type distinctly', () => {
    for (const [type, label] of [
      ['any_game', 'wants to be put in a game'],
      ['if_needed', 'will play if needed'],
      ['spectating', 'is coming to hang out'],
    ]) {
      const events = _diffRsvpEvents(
        [night()],
        [night({ rsvps: [{ userId: GUEST, name: 'Deb', type }] })],
        GUEST
      );
      expect(events[0].body).toBe(`Deb ${label}`);
    }
  });

  it('reports a decline', () => {
    const events = _diffRsvpEvents([night()], [night({ declined: [GUEST] })], GUEST);
    expect(events).toHaveLength(1);
    expect(events[0].body).toContain("can't make it");
  });

  it('reports a cancelled RSVP', () => {
    const current  = [night({ rsvps: [{ userId: GUEST, name: 'Deb', type: 'playing' }] })];
    const accepted = [night()];
    const events = _diffRsvpEvents(current, accepted, GUEST);
    expect(events).toHaveLength(1);
    expect(events[0].body).toBe('Deb cancelled their RSVP');
  });

  it('is silent when the host edits their own night', () => {
    const current  = [night()];
    const accepted = [night({ rsvps: [{ userId: HOST, name: 'Jason', type: 'playing' }] })];
    expect(_diffRsvpEvents(current, accepted, HOST)).toHaveLength(0);
  });

  it('is silent for brand-new nights and tombstones', () => {
    const created = _diffRsvpEvents([], [night({ rsvps: [{ userId: GUEST, type: 'playing' }] })], GUEST);
    expect(created).toHaveLength(0);
    const deleted = _diffRsvpEvents(
      [night({ rsvps: [{ userId: GUEST, type: 'playing' }] })],
      [{ id: 'n1', hostUserId: HOST, deleted: true, lastModified: 1 }],
      GUEST
    );
    expect(deleted).toHaveLength(0);
  });

  it('is silent when nothing about RSVPs changed', () => {
    const same = night({ rsvps: [{ userId: GUEST, name: 'Deb', type: 'playing' }] });
    expect(_diffRsvpEvents([same], [structuredClone(same)], GUEST)).toHaveLength(0);
  });

  it('does not report a cancel when the RSVP moved to declined', () => {
    const current  = [night({ rsvps: [{ userId: GUEST, name: 'Deb', type: 'playing' }] })];
    const accepted = [night({ declined: [GUEST] })];
    const events = _diffRsvpEvents(current, accepted, GUEST);
    expect(events).toHaveLength(1);
    expect(events[0].body).toContain("can't make it");
  });
});

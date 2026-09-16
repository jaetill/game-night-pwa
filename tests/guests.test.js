// Tests for the unified guest list helpers (ADR-0021).
import { describe, it, expect } from 'vitest';
import {
  newGuest, normalizeGuests, findGuest, claimGuest, playerKey,
  pendingGuests, attendingGuests, declinedGuests, isAttending, plusOnesOf, isPlusOne,
  setResponse, removeGuests, mergeGuestChanges,
} from '../lambda/lib/guests.js';

const HOST = 'host-1';

function legacyNight() {
  return {
    id: 'n1', hostUserId: HOST, lastModified: 1000,
    invited:  ['pending@example.com', 'uid-pending'],
    rsvps:    [
      { userId: HOST,    name: 'Host',  type: 'playing', timestamp: 900 },
      { userId: 'uid-a', name: 'Alice', type: 'any_game', email: 'alice@example.com', guests: 2 },
      { userId: 'uid-f', name: 'Fran',  type: 'flexible' },
    ],
    declined: ['uid-d'],
  };
}

describe('normalizeGuests — legacy arrays', () => {
  it('reconstructs one entry per person with deterministic ids', () => {
    const g = normalizeGuests(legacyNight());
    const ids = g.map(x => x.id).sort();
    expect(ids).toEqual([
      'legacy-host-1', 'legacy-pending@example.com', 'legacy-uid-a', 'legacy-uid-d',
      'legacy-uid-f', 'legacy-uid-pending', 'uid-a_guest_1', 'uid-a_guest_2',
    ].sort());
  });

  it('is deterministic across calls (two clients agree)', () => {
    const a = JSON.stringify(normalizeGuests(legacyNight()));
    const b = JSON.stringify(normalizeGuests(legacyNight()));
    expect(a).toBe(b);
  });

  it('maps responses, pending and declined correctly', () => {
    const g = normalizeGuests(legacyNight());
    expect(pendingGuests(g).map(x => x.id).sort()).toEqual(['legacy-pending@example.com', 'legacy-uid-pending']);
    expect(declinedGuests(g).map(x => x.userId)).toEqual(['uid-d']);
    expect(attendingGuests(g).map(x => x.id).sort()).toEqual([
      'legacy-host-1', 'legacy-uid-a', 'legacy-uid-f', 'uid-a_guest_1', 'uid-a_guest_2',
    ]);
    expect(g.find(x => x.userId === 'uid-f').response.type).toBe('if_needed'); // 'flexible' alias
    expect(g.find(x => x.userId === 'uid-a').email).toBe('alice@example.com');
    expect(g.find(x => x.userId === 'uid-a').response.type).toBe('any_game');
  });

  it('turns rsvp.guests count into anonymous plus-ones sponsored by the rsvp-er', () => {
    const g = normalizeGuests(legacyNight());
    const plus = plusOnesOf(g, 'uid-a');
    expect(plus).toHaveLength(2);
    expect(plus.every(p => p.userId === null && p.response.type === 'if_needed')).toBe(true);
    // Same synthetic ids the old renderer stored in signedUpPlayers
    expect(playerKey(plus[0])).toBe('uid-a_guest_1');
  });

  it('email-keyed pending entries have no userId and a lowercased email', () => {
    const g = normalizeGuests({ hostUserId: HOST, invited: ['Pending@Example.com'] });
    expect(g[0]).toMatchObject({ userId: null, email: 'pending@example.com', invitedBy: HOST, response: null });
  });

  it('does not duplicate a person present in both invited[] and rsvps[]', () => {
    const g = normalizeGuests({ hostUserId: HOST, invited: ['uid-a', 'a@x.com'], rsvps: [{ userId: 'uid-a', type: 'playing', email: 'a@x.com' }] });
    expect(g).toHaveLength(1);
  });

  it('prefers guests[] when present and ignores legacy arrays', () => {
    const g = normalizeGuests({ guests: [newGuest({ id: 'x', userId: 'u1' })], invited: ['zzz@x.com'], rsvps: [{ userId: 'u9' }] });
    expect(g.map(x => x.id)).toEqual(['x']);
  });

  it('drops malformed entries and duplicate ids from guests[]', () => {
    const g = normalizeGuests({ guests: [null, { userId: 'no-id' }, newGuest({ id: 'a' }), newGuest({ id: 'a' })] });
    expect(g.map(x => x.id)).toEqual(['a']);
  });

  it('normalizes a bad response type to pending', () => {
    const g = normalizeGuests({ guests: [{ id: 'a', response: { type: 'yes-ish' } }] });
    expect(g[0].response).toBeNull();
  });
});

describe('findGuest / claimGuest', () => {
  it('matches by userId first', () => {
    const g = [newGuest({ id: '1', userId: 'u1', email: 'one@x.com' }), newGuest({ id: '2', email: 'two@x.com' })];
    expect(findGuest(g, { userId: 'u1', email: 'two@x.com' }).id).toBe('1');
  });

  it('findGuest falls back to email and is pure', () => {
    const g = [newGuest({ id: '2', email: 'Two@X.com' })];
    const snapshot = JSON.stringify(g);
    expect(findGuest(g, { userId: 'u2', email: 'two@x.com' }).id).toBe('2');
    expect(JSON.stringify(g)).toBe(snapshot);
  });

  it('claimGuest fills in the userId + name on first contact', () => {
    const g = [newGuest({ id: '2', email: 'Two@X.com' })];
    const hit = claimGuest(g, { userId: 'u2', email: 'two@x.com', name: 'Two' });
    expect(hit.id).toBe('2');
    expect(g[0].userId).toBe('u2');
    expect(g[0].name).toBe('Two');
  });

  it('plus-ones are entries with neither account nor email', () => {
    expect(isPlusOne(newGuest({ invitedBy: 'u1' }))).toBe(true);
    expect(isPlusOne(newGuest({ invitedBy: 'u1', email: 'f@x.com' }))).toBe(false);
    expect(plusOnesOf([newGuest({ invitedBy: 'u1' }), newGuest({ invitedBy: 'u1', email: 'f@x.com' })], 'u1')).toHaveLength(1);
  });

  it('returns null when nobody matches', () => {
    expect(findGuest([newGuest({ id: '1', userId: 'u1' })], { userId: 'u9', email: 'no@x.com' })).toBeNull();
  });
});

describe('setResponse / removeGuests', () => {
  it('sets and clears a response on the matched entry', () => {
    const g = [newGuest({ id: '1', userId: 'u1' })];
    expect(setResponse(g, { userId: 'u1' }, 'playing', { at: 5 }).response).toEqual({ type: 'playing', at: 5 });
    expect(isAttending(g, 'u1')).toBe(true);
    setResponse(g, { userId: 'u1' }, null);
    expect(g[0].response).toBeNull();
    expect(isAttending(g, 'u1')).toBe(false);
  });

  it('returns null for an unknown person (caller decides whether to create)', () => {
    expect(setResponse([], { userId: 'u1' }, 'playing')).toBeNull();
  });

  it('removeGuests filters in place and returns the removed entries', () => {
    const night = { guests: [newGuest({ id: '1', userId: 'u1' }), newGuest({ id: '2', invitedBy: 'u1' })] };
    const removed = removeGuests(night, g => g.userId === null);
    expect(removed.map(g => g.id)).toEqual(['2']);
    expect(night.guests.map(g => g.id)).toEqual(['1']);
  });
});

describe('mergeGuestChanges — non-host saves are merged, not rejected', () => {
  const me = 'me';
  const base = () => [
    newGuest({ id: 'h', userId: HOST, invitedBy: HOST, invitedAt: 1, response: { type: 'playing', at: 1 } }),
    newGuest({ id: 'm', userId: me,   invitedBy: HOST, invitedAt: 1, response: null }),
    newGuest({ id: 'o', userId: 'other', invitedBy: HOST, invitedAt: 1, response: null }),
  ];
  const clone = g => JSON.parse(JSON.stringify(g));
  const ok = r => { expect(r.error).toBeUndefined(); return r.guests; };
  const byId = (list, id) => list.find(g => g.id === id);

  it('applies my own response and name', () => {
    const before = base(), after = clone(before);
    after[1].response = { type: 'playing', at: 2 }; after[1].name = 'Me!';
    const out = ok(mergeGuestChanges(before, after, me));
    expect(byId(out, 'm')).toMatchObject({ response: { type: 'playing', at: 2 }, name: 'Me!' });
  });

  it('keeps the server copy of everyone else, even when my upload differs (stale tab)', () => {
    const before = base(); before[2].response = { type: 'any_game', at: 5 };   // Other RSVP'd after I loaded
    before.push(newGuest({ id: 'n', userId: 'new', invitedBy: HOST, invitedAt: 6 })); // host invited someone
    const after = clone(base()); after[1].response = { type: 'playing', at: 7 };
    after[2].response = { type: 'declined', at: 7 };                            // I tampered with Other
    const out = ok(mergeGuestChanges(before, after, me));
    expect(byId(out, 'o').response).toEqual({ type: 'any_game', at: 5 });
    expect(byId(out, 'n')).toBeDefined();
    expect(byId(out, 'm').response.type).toBe('playing');
  });

  it('ignores my attempt to remove someone else or myself', () => {
    const before = base();
    const out = ok(mergeGuestChanges(before, before.filter(g => g.id === 'h'), me));
    expect(out.map(g => g.id).sort()).toEqual(['h', 'm', 'o']);
  });

  it('ignores my attempt to change my own invitedBy / invitedAt', () => {
    const before = base(), after = clone(before);
    after[1].invitedBy = me; after[1].invitedAt = 999;
    const out = ok(mergeGuestChanges(before, after, me));
    expect(byId(out, 'm')).toMatchObject({ invitedBy: HOST, invitedAt: 1 });
  });

  it('lets an email invitee claim their entry (userId fill-in) and respond — only with a verified matching email', () => {
    const before = [newGuest({ id: 'e', email: 'me@x.com', invitedBy: HOST, invitedAt: 1 })];
    const after  = clone(before);
    after[0].userId = me; after[0].name = 'Me'; after[0].response = { type: 'playing', at: 2 };
    const out = ok(mergeGuestChanges(before, after, me, { actorEmail: 'Me@X.com' }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'e', userId: me, name: 'Me', response: { type: 'playing' } });
    // The client's stated email is not proof: no verified email, or a different one → not on the list.
    expect(mergeGuestChanges(before, clone(after), me).error).toMatch(/not on the guest list/);
    expect(mergeGuestChanges(before, clone(after), me, { actorEmail: 'someone-else@x.com' }).error).toMatch(/not on the guest list/);
  });

  it('rejects adding myself when I am not on the list', () => {
    const before = base().slice(0, 1);
    const after  = [...clone(before), newGuest({ id: 'new', userId: me, invitedBy: me, invitedAt: 2 })];
    expect(mergeGuestChanges(before, after, me).error).toMatch(/not on the guest list/);
  });

  it('rejects bringing people while pending', () => {
    const before = base();
    const after  = [...clone(before), newGuest({ id: 'p1', invitedBy: me, invitedAt: 2, response: { type: 'if_needed', at: 2 } })];
    expect(mergeGuestChanges(before, after, me).error).toMatch(/attending guests/);
  });

  it('lets an attending guest add a plus-one and a named friend attributed to them', () => {
    const before = base(); before[1].response = { type: 'playing', at: 1 };
    const after  = [...clone(before),
      newGuest({ id: 'p1', invitedBy: me, invitedAt: 2, response: { type: 'if_needed', at: 2 } }),
      newGuest({ id: 'p2', email: 'friend@x.com', invitedBy: me, invitedAt: 2 }),
    ];
    const out = ok(mergeGuestChanges(before, after, me));
    expect(out.map(g => g.id)).toEqual(['h', 'm', 'o', 'p1', 'p2']);
  });

  it('allows responding yes and bringing a plus-one in the same save', () => {
    const before = base();
    const after  = clone(before); after[1].response = { type: 'playing', at: 2 };
    after.push(newGuest({ id: 'p1', invitedBy: me, invitedAt: 2, response: { type: 'if_needed', at: 2 } }));
    expect(ok(mergeGuestChanges(before, after, me))).toHaveLength(4);
  });

  it('drops additions attributed to someone else, and duplicates of people already listed', () => {
    const before = base(); before[1].response = { type: 'playing', at: 1 };
    const after  = [...clone(before),
      newGuest({ id: 'x1', email: 'x@x.com', invitedBy: HOST, invitedAt: 2 }),
      newGuest({ id: 'x2', userId: 'other', invitedBy: me, invitedAt: 2 }),
    ];
    expect(ok(mergeGuestChanges(before, after, me)).map(g => g.id)).toEqual(['h', 'm', 'o']);
  });

  it('removes / renames my own anonymous plus-ones but not a friend I invited by email', () => {
    const before = [...base(),
      newGuest({ id: 'p1', invitedBy: me, invitedAt: 2, response: { type: 'if_needed', at: 2 } }),
      newGuest({ id: 'p2', email: 'friend@x.com', invitedBy: me, invitedAt: 2 }),
    ];
    before[1].response = { type: 'playing', at: 1 };
    const removed = ok(mergeGuestChanges(before, before.filter(g => g.id !== 'p1' && g.id !== 'p2'), me));
    expect(removed.map(g => g.id)).toEqual(['h', 'm', 'o', 'p2']);
    const renamed = clone(before); byId(renamed, 'p1').name = 'Sam'; byId(renamed, 'p1').invitedBy = HOST;
    expect(byId(ok(mergeGuestChanges(before, renamed, me)), 'p1')).toMatchObject({ name: 'Sam', invitedBy: me });
  });

  it('cancel (response → null) then re-respond both apply', () => {
    const before = base(); before[1].response = { type: 'playing', at: 1 };
    const a1 = clone(before); a1[1].response = null;
    const out1 = ok(mergeGuestChanges(before, a1, me));
    expect(byId(out1, 'm').response).toBeNull();
    const a2 = clone(out1); a2[1].response = { type: 'spectating', at: 3 };
    expect(byId(ok(mergeGuestChanges(out1, a2, me)), 'm').response.type).toBe('spectating');
  });

  it('a stale tab whose own entry has a different id still lands its response', () => {
    const before = base();
    const after  = [...clone(before).filter(g => g.id !== 'm'), newGuest({ id: 'legacy-me', userId: me, invitedBy: HOST, invitedAt: 1, response: { type: 'playing', at: 2 } })];
    const out = ok(mergeGuestChanges(before, after, me));
    expect(out.map(g => g.id).sort()).toEqual(['h', 'm', 'o']);
    expect(byId(out, 'm').response.type).toBe('playing');
  });

  it('keeps my NEWER server-side answer when a stale tab uploads an older one', () => {
    const before = base(); before[1].response = { type: 'playing', at: 50 }; before[1].respondedAt = 50; // answered via email link
    const stale  = clone(base()); // tab opened earlier: pending
    stale[1].respondedAt = null;
    // The stale tab saves something unrelated — its copy of me is still pending.
    expect(byId(ok(mergeGuestChanges(before, stale, me)), 'm').response.type).toBe('playing');
    // But a genuinely newer cancel from the client wins.
    const newer = clone(base()); newer[1].response = null; newer[1].respondedAt = 60;
    expect(byId(ok(mergeGuestChanges(before, newer, me)), 'm').response).toBeNull();
  });

  it('clamps a future-dated respondedAt so it cannot pin the entry forever', () => {
    const before = base(); before[1].response = { type: 'playing', at: 50 }; before[1].respondedAt = 50;
    const forged = clone(base()); forged[1].response = null; forged[1].respondedAt = Number.MAX_SAFE_INTEGER;
    const out = ok(mergeGuestChanges(before, forged, me, { now: 100 }));
    expect(byId(out, 'm').response).toBeNull();                 // it still wins now (it is newer)…
    expect(byId(out, 'm').respondedAt).toBeLessThanOrEqual(100 + 5 * 60 * 1000); // …but with a sane timestamp
  });

  it('claims an email-only entry that exists under a different id (legacy drift)', () => {
    const before = [newGuest({ id: 'srv', email: 'me@x.com', invitedBy: HOST, invitedAt: 1 })];
    const after  = [newGuest({ id: 'cli', userId: me, email: 'me@x.com', invitedBy: HOST, invitedAt: 1, response: { type: 'playing', at: 2 } })];
    const out = ok(mergeGuestChanges(before, after, me, { actorEmail: 'me@x.com' }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'srv', userId: me, response: { type: 'playing' } });
  });

  it('lets me add a real person but not answer for them', () => {
    const before = base(); before[1].response = { type: 'playing', at: 1 };
    const after  = [...clone(before), newGuest({ id: 'c', userId: 'carol', invitedBy: me, invitedAt: 2, response: { type: 'declined', at: 2 } })];
    expect(byId(ok(mergeGuestChanges(before, after, me)), 'c').response).toBeNull();
  });

  it('returns an identical list for an identical upload', () => {
    const before = base();
    expect(ok(mergeGuestChanges(before, clone(before), me))).toEqual(before);
  });
});

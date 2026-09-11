// Tests for lambda/rsvpLink.js — the public one-click RSVP + no-login game
// picker route.
//
// Three layers:
//   1. applyGameAction / applyChoice — pure mutations against a night object.
//      Capacity, idempotency, RSVP upgrade-on-join, decline cascade.
//   2. renderPickerPage — pure HTML render. Every host/guest-supplied string
//      must be escaped (this page is served on a public route, so a hostile
//      game title or side description is a stored-XSS vector).
//   3. handler — end-to-end through the _setForTest seam: token verification,
//      the read/mutate/conditional-write loop, and the "no write on no-op"
//      guarantee (a stale link must not bump lastModified).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rsvpLink = require('../lambda/rsvpLink.js');
const { signRsvpToken } = require('../lambda/lib/rsvpToken.js');

const {
  _applyChoice:      applyChoice,
  _applyGameAction:  applyGameAction,
  _renderPickerPage: renderPickerPage,
} = rsvpLink;

const SECRET = 'unit-test-secret';
const ME     = { userId: 'me-uuid', name: 'Deb', email: 'deb@example.com', matched: true };

function makeNight(over = {}) {
  return {
    id: 'n1',
    hostUserId: 'jaetill',
    date: '2026-09-26',
    time: '6:30 PM',
    location: "Jason's",
    description: 'Casual night',
    food: 'Chili',
    allowSides: true,
    sides: [],
    invited: ['me-uuid', 'deb@example.com'],
    rsvps: [],
    declined: [],
    selectedGames: {
      g1: { title: 'Catan',  maxPlayers: 4, signedUpPlayers: [], interestedPlayers: [] },
      g2: { title: 'Codenames', maxPlayers: 2, signedUpPlayers: [{ userId: 'a', name: 'A' }, { userId: 'b', name: 'B' }], interestedPlayers: [] },
    },
    ...over,
  };
}

// ── applyGameAction ───────────────────────────────────────────────────────

describe('applyGameAction', () => {
  it('games is a pure view — no change, no banner', () => {
    const night = makeNight();
    const r = applyGameAction(night, ME, 'games');
    expect(r).toEqual({ ok: true, changed: false, banner: null });
    expect(night.rsvps).toHaveLength(0);
  });

  it('join adds the player and creates a playing RSVP when none exists', () => {
    const night = makeNight();
    const r = applyGameAction(night, ME, 'join', { gameId: 'g1' });
    expect(r.changed).toBe(true);
    expect(night.selectedGames.g1.signedUpPlayers).toEqual([{ userId: 'me-uuid', name: 'Deb' }]);
    expect(night.rsvps).toEqual([{ userId: 'me-uuid', name: 'Deb', type: 'playing' }]);
  });

  it('join upgrades an if_needed RSVP to playing (app rule: only playing can join)', () => {
    const night = makeNight({ rsvps: [{ userId: 'me-uuid', name: 'Deb', type: 'if_needed' }] });
    applyGameAction(night, ME, 'join', { gameId: 'g1' });
    expect(night.rsvps).toHaveLength(1);
    expect(night.rsvps[0].type).toBe('playing');
  });

  it('join clears a prior interest flag on the same game', () => {
    const night = makeNight();
    night.selectedGames.g1.interestedPlayers.push({ userId: 'me-uuid', name: 'Deb' });
    applyGameAction(night, ME, 'join', { gameId: 'g1' });
    expect(night.selectedGames.g1.interestedPlayers).toEqual([]);
  });

  it('join is idempotent', () => {
    const night = makeNight();
    applyGameAction(night, ME, 'join', { gameId: 'g1' });
    const r = applyGameAction(night, ME, 'join', { gameId: 'g1' });
    expect(r.changed).toBe(false);
    expect(night.selectedGames.g1.signedUpPlayers).toHaveLength(1);
  });

  it('join refuses a full game and does not touch rsvps', () => {
    const night = makeNight();
    const r = applyGameAction(night, ME, 'join', { gameId: 'g2' });
    expect(r.changed).toBe(false);
    expect(r.banner.tone).toBe('warn');
    expect(night.selectedGames.g2.signedUpPlayers).toHaveLength(2);
    expect(night.rsvps).toHaveLength(0);
  });

  it('join with an unknown or missing gameId is a warn no-op', () => {
    const night = makeNight();
    expect(applyGameAction(night, ME, 'join', { gameId: 'nope' }).changed).toBe(false);
    expect(applyGameAction(night, ME, 'join', {}).changed).toBe(false);
    // Prototype keys must not resolve to a game.
    expect(applyGameAction(night, ME, 'join', { gameId: 'constructor' }).changed).toBe(false);
  });

  it('leave removes the player but keeps their RSVP', () => {
    const night = makeNight({ rsvps: [{ userId: 'me-uuid', name: 'Deb', type: 'playing' }] });
    night.selectedGames.g1.signedUpPlayers.push({ userId: 'me-uuid', name: 'Deb' });
    const r = applyGameAction(night, ME, 'leave', { gameId: 'g1' });
    expect(r.changed).toBe(true);
    expect(night.selectedGames.g1.signedUpPlayers).toEqual([]);
    expect(night.rsvps).toHaveLength(1);
  });

  it('interested / uninterested toggle and are idempotent', () => {
    const night = makeNight();
    expect(applyGameAction(night, ME, 'interested', { gameId: 'g2' }).changed).toBe(true);
    expect(applyGameAction(night, ME, 'interested', { gameId: 'g2' }).changed).toBe(false);
    expect(night.selectedGames.g2.interestedPlayers).toEqual([{ userId: 'me-uuid', name: 'Deb' }]);
    expect(applyGameAction(night, ME, 'uninterested', { gameId: 'g2' }).changed).toBe(true);
    expect(applyGameAction(night, ME, 'uninterested', { gameId: 'g2' }).changed).toBe(false);
    expect(night.selectedGames.g2.interestedPlayers).toEqual([]);
  });

  it('interested on a full game works (that is the point of interest)', () => {
    const night = makeNight();
    expect(applyGameAction(night, ME, 'interested', { gameId: 'g2' }).changed).toBe(true);
  });

  it('a declined guest cannot act on games or sides', () => {
    const night = makeNight({ declined: ['me-uuid'] });
    for (const choice of ['join', 'interested', 'side']) {
      const r = applyGameAction(night, ME, choice, { gameId: 'g1', desc: 'rolls' });
      expect(r.changed).toBe(false);
      expect(r.banner.tone).toBe('warn');
    }
    expect(night.selectedGames.g1.signedUpPlayers).toEqual([]);
    expect(night.sides).toEqual([]);
  });

  it('tolerates a night whose games lack player arrays', () => {
    const night = makeNight({ selectedGames: { g1: { title: 'Catan', maxPlayers: 4 } } });
    expect(applyGameAction(night, ME, 'join', { gameId: 'g1' }).changed).toBe(true);
    expect(night.selectedGames.g1.signedUpPlayers).toHaveLength(1);
    expect(night.selectedGames.g1.interestedPlayers).toEqual([]);
  });

  describe('sides', () => {
    it('side replaces any prior side for the same user, trimmed and capped', () => {
      const night = makeNight({ sides: [{ userId: 'me-uuid', name: 'Deb', description: 'old' }] });
      const r = applyGameAction(night, ME, 'side', { desc: '  corn   bread  ' + 'x'.repeat(500) });
      expect(r.changed).toBe(true);
      expect(night.sides).toHaveLength(1);
      expect(night.sides[0].description.length).toBeLessThanOrEqual(120);
      expect(night.sides[0].description.startsWith('corn bread')).toBe(true);
    });

    it('side with an empty description is a warn no-op', () => {
      const night = makeNight();
      expect(applyGameAction(night, ME, 'side', { desc: '   ' }).changed).toBe(false);
      expect(applyGameAction(night, ME, 'side', {}).changed).toBe(false);
      expect(night.sides).toEqual([]);
    });

    it('side is refused when the host is not taking sides or has no food plan', () => {
      expect(applyGameAction(makeNight({ allowSides: false }), ME, 'side', { desc: 'rolls' }).changed).toBe(false);
      expect(applyGameAction(makeNight({ food: null }), ME, 'side', { desc: 'rolls' }).changed).toBe(false);
    });

    it('unside removes only my side', () => {
      const night = makeNight({ sides: [
        { userId: 'me-uuid', name: 'Deb', description: 'rolls' },
        { userId: 'other',   name: 'O',   description: 'slaw' },
      ] });
      expect(applyGameAction(night, ME, 'unside').changed).toBe(true);
      expect(night.sides).toEqual([{ userId: 'other', name: 'O', description: 'slaw' }]);
      expect(applyGameAction(night, ME, 'unside').changed).toBe(false);
    });
  });
});

// ── applyChoice ───────────────────────────────────────────────────────────

describe('applyChoice', () => {
  it('declining withdraws the user from every game, their interest, and their side', () => {
    const night = makeNight({
      rsvps: [{ userId: 'me-uuid', name: 'Deb', type: 'playing' }],
      sides: [{ userId: 'me-uuid', name: 'Deb', description: 'rolls' }],
    });
    night.selectedGames.g1.signedUpPlayers.push({ userId: 'me-uuid', name: 'Deb' });
    night.selectedGames.g2.interestedPlayers.push({ userId: 'me-uuid', name: 'Deb' });

    applyChoice(night, { ...ME, invitee: 'deb@example.com' }, 'declined');

    expect(night.declined).toEqual(['me-uuid']);
    expect(night.rsvps).toEqual([]);
    expect(night.sides).toEqual([]);
    expect(night.selectedGames.g1.signedUpPlayers).toEqual([]);
    expect(night.selectedGames.g2.interestedPlayers).toEqual([]);
    // Other people's seats are untouched.
    expect(night.selectedGames.g2.signedUpPlayers).toHaveLength(2);
    // Both invite keys are dropped.
    expect(night.invited).toEqual([]);
  });

  it('re-RSVPing after a decline clears the decline (idempotent swap)', () => {
    const night = makeNight({ declined: ['me-uuid'] });
    applyChoice(night, { ...ME, invitee: 'me-uuid' }, 'playing');
    expect(night.declined).toEqual([]);
    expect(night.rsvps).toEqual([{ userId: 'me-uuid', name: 'Deb', type: 'playing' }]);
  });
});

// ── renderPickerPage ──────────────────────────────────────────────────────

describe('renderPickerPage', () => {
  const TOKEN = 'abc.def';

  it('escapes every host- and guest-supplied string', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const night = makeNight({
      location: evil, description: evil, food: evil,
      sides: [{ userId: 'x', name: evil, description: evil }],
      selectedGames: { g1: { title: evil, thumbnail: `"${evil}`, maxPlayers: 4,
        signedUpPlayers: [{ userId: 'p', name: evil }], interestedPlayers: [{ userId: 'q', name: evil }] } },
    });
    const html = renderPickerPage(night, { ...ME, name: evil }, TOKEN, { tone: 'ok', text: evil });
    expect(html).not.toContain('<img src=x');
    // The escaped form is the ONLY form present — the payload's tag never
    // survives as a tag or as an unquoted attribute value.
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html.match(/onerror=alert/g).length).toBe(html.match(/&lt;img src=x onerror=alert\(1\)&gt;/g).length);
    expect(html).toContain('src="&quot;&lt;img');
  });

  it('URL-encodes the token and gameId in every action link', () => {
    const night = makeNight({ selectedGames: { 'g 1&x': { title: 'T', maxPlayers: 4, signedUpPlayers: [], interestedPlayers: [] } } });
    const html = renderPickerPage(night, ME, 'a b+c', null);
    expect(html).toContain('?token=a%20b%2Bc&choice=join&game=g%201%26x');
    expect(html).not.toContain('token=a b+c');
  });

  it('shows Join on open games, Full on full games, Leave when signed up', () => {
    const night = makeNight({ rsvps: [{ userId: 'me-uuid', name: 'Deb', type: 'playing' }] });
    night.selectedGames.g1.signedUpPlayers.push({ userId: 'me-uuid', name: 'Deb' });
    const html = renderPickerPage(night, ME, TOKEN, null);
    expect(html).toContain('choice=leave&game=g1');
    expect(html).not.toContain('choice=join&game=g1');
    expect(html).toContain('>Full<');
    expect(html).toContain('choice=interested&game=g2');
  });

  it('shows the RSVP buttons when the guest has not responded, and the status line when they have', () => {
    const fresh = renderPickerPage(makeNight(), ME, TOKEN, null);
    expect(fresh).toContain('choice=playing');
    expect(fresh).toContain('choice=if_needed');
    expect(fresh).toContain('choice=declined');

    const rsvpd = renderPickerPage(makeNight({ rsvps: [{ userId: 'me-uuid', name: 'Deb', type: 'if_needed' }] }), ME, TOKEN, null);
    expect(rsvpd).toContain("You&#39;ll play if needed");
    expect(rsvpd).not.toContain('choice=if_needed');

    // An RSVP type this page doesn't know about still gets a label.
    const odd = renderPickerPage(makeNight({ rsvps: [{ userId: 'me-uuid', name: 'Deb', type: 'future_type' }] }), ME, TOKEN, null);
    expect(odd).toContain("You&#39;ve RSVP&#39;d");
  });

  it('renders the food plan, existing sides, and the side form only when allowSides', () => {
    const open = renderPickerPage(makeNight({ sides: [{ userId: 'o', name: 'Oz', description: 'slaw' }] }), ME, TOKEN, null);
    expect(open).toContain('Chili');
    expect(open).toContain('Oz: slaw');
    expect(open).toContain('name="choice" value="side"');
    expect(open).toContain(`name="token" value="${TOKEN}"`);

    const closed = renderPickerPage(makeNight({ allowSides: false }), ME, TOKEN, null);
    expect(closed).toContain('Chili');
    expect(closed).not.toContain('value="side"');

    const noFood = renderPickerPage(makeNight({ food: null }), ME, TOKEN, null);
    expect(noFood).not.toContain('>Food<');
  });

  it('hides game/side actions for a declined guest and offers a way back', () => {
    const html = renderPickerPage(makeNight({ declined: ['me-uuid'] }), ME, TOKEN, null);
    expect(html).not.toContain('choice=join');
    expect(html).not.toContain('value="side"');
    expect(html).toContain('Changed your mind?');
    expect(html).toContain('choice=playing');
  });

  it('renders a stored 24h time as 12h', () => {
    const html = renderPickerPage(makeNight({ time: '19:00' }), ME, TOKEN, null);
    expect(html).toContain('7:00 PM');
    expect(html).not.toContain('19:00');
  });

  it('copes with an empty game list', () => {
    const html = renderPickerPage(makeNight({ selectedGames: {} }), ME, TOKEN, null);
    expect(html).toContain('No games on the table yet');
  });
});

// ── handler (end to end via test seam) ────────────────────────────────────

describe('handler', () => {
  let stored, puts;

  function mocks(nights) {
    stored = JSON.stringify(nights);
    puts = [];
    return {
      smClient: { send: vi.fn(async () => ({ SecretString: JSON.stringify({ secret: SECRET }) })) },
      s3: {
        send: vi.fn(async (cmd) => {
          if (cmd.input?.Body !== undefined) { puts.push(cmd.input); stored = cmd.input.Body; return {}; }
          if (cmd.input?.Key === 'gameNights.json') return { ETag: '"e1"', Body: { transformToString: async () => stored } };
          // push-subscriptions/* lookups from lib/push — pretend none exist
          const err = new Error('NoSuchKey'); err.name = 'NoSuchKey'; throw err;
        }),
      },
      cognito: { send: vi.fn(async () => ({ UserAttributes: [{ Name: 'name', Value: 'Deb' }, { Name: 'email', Value: 'deb@example.com' }] })) },
    };
  }

  function evt(qs) {
    return { httpMethod: 'GET', resource: '/rsvp', queryStringParameters: qs };
  }
  function tok(over = {}) {
    return signRsvpToken({ nightId: 'n1', invitee: 'me-uuid', exp: Date.now() + 60_000, ...over }, SECRET);
  }
  const ctx = { awsRequestId: 'test' };

  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { rsvpLink._resetForTest(); vi.restoreAllMocks(); });

  it('rejects an unknown choice and a bad token with the expired page, without touching S3', async () => {
    rsvpLink._setForTest(mocks([makeNight()]));
    const bad = await rsvpLink.handler(evt({ token: tok(), choice: 'hack' }), ctx);
    expect(bad.statusCode).toBe(400);
    const forged = await rsvpLink.handler(evt({ token: tok() + 'x', choice: 'join', game: 'g1' }), ctx);
    expect(forged.statusCode).toBe(400);
    expect(puts).toHaveLength(0);
  });

  it('games renders the picker without writing, with hardening headers', async () => {
    rsvpLink._setForTest(mocks([makeNight()]));
    const res = await rsvpLink.handler(evt({ token: tok(), choice: 'games' }), ctx);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toMatch(/text\/html/);
    expect(res.headers['X-Frame-Options']).toBe('DENY');
    expect(res.headers['Content-Security-Policy']).toMatch(/default-src 'none'/);
    expect(res.headers['Content-Security-Policy']).toMatch(/form-action 'self'/);
    expect(res.body).toContain('Catan');
    expect(res.body).toContain('Chili');
    expect(puts).toHaveLength(0);
  });

  it('join writes with If-Match and the page reflects the new state', async () => {
    rsvpLink._setForTest(mocks([makeNight()]));
    const res = await rsvpLink.handler(evt({ token: tok(), choice: 'join', game: 'g1' }), ctx);
    expect(res.statusCode).toBe(200);
    expect(puts).toHaveLength(1);
    expect(puts[0].IfMatch).toBe('"e1"');
    const saved = JSON.parse(stored)[0];
    expect(saved.selectedGames.g1.signedUpPlayers).toEqual([{ userId: 'me-uuid', name: 'Deb' }]);
    expect(saved.rsvps[0].type).toBe('playing');
    expect(res.body).toContain("You&#39;re in Catan!");
    expect(res.body).toContain('choice=leave&game=g1');
  });

  it('a stale join on a full game is a no-op: page 200, no S3 write', async () => {
    rsvpLink._setForTest(mocks([makeNight()]));
    const res = await rsvpLink.handler(evt({ token: tok(), choice: 'join', game: 'g2' }), ctx);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('is full');
    expect(puts).toHaveLength(0);
  });

  it('side reads desc from the query string (the form is a GET)', async () => {
    rsvpLink._setForTest(mocks([makeNight()]));
    const res = await rsvpLink.handler(evt({ token: tok(), choice: 'side', desc: 'cornbread' }), ctx);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(stored)[0].sides).toEqual([{ userId: 'me-uuid', name: 'Deb', description: 'cornbread' }]);
    expect(res.body).toContain('cornbread');
    expect(res.body).toContain('choice=unside');
  });

  it('playing lands on the picker; declined lands on the static page', async () => {
    rsvpLink._setForTest(mocks([makeNight()]));
    const yes = await rsvpLink.handler(evt({ token: tok(), choice: 'playing' }), ctx);
    expect(yes.body).toContain('Catan');
    expect(yes.body).toContain("You&#39;re in!");

    const no = await rsvpLink.handler(evt({ token: tok(), choice: 'declined' }), ctx);
    expect(no.body).toContain("Sorry you can&#39;t make it.");
    expect(no.body).not.toContain('Catan');
    expect(JSON.parse(stored)[0].declined).toEqual(['me-uuid']);
  });

  it('the token pins the night: a token for another night cannot touch this one', async () => {
    rsvpLink._setForTest(mocks([makeNight()]));
    const res = await rsvpLink.handler(evt({ token: tok({ nightId: 'other' }), choice: 'join', game: 'g1' }), ctx);
    expect(res.statusCode).toBe(404);
    expect(puts).toHaveLength(0);
  });
});

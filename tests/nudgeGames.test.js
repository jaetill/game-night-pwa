// lambda/nudge.js — games list + per-game Join links in invite/nudge emails,
// and human time formatting.
//
// Jason's first look at the real invite email: "it doesn't show the
// different games being offered either" — and the time rendered as the raw
// stored "19:00". Both fixed here; these tests pin them.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nudge = require('../lambda/nudge.js');
const {
  _buildHtml: buildHtml,
  _buildInviteHtml: buildInviteHtml,
  _buildText: buildText,
  _buildInviteText: buildInviteText,
  _gamesCtx: gamesCtx,
  _formatTime: formatTime,
} = nudge;

const LINKS = {
  yes: 'https://x/y', ifNeeded: 'https://x/i', no: 'https://x/n', games: 'https://x/g',
  join: (id) => `https://x/j?game=${encodeURIComponent(id)}`,
};
const BASE  = { name: 'Alice', hostName: 'Bob', dateStr: 'Saturday, September 26', timeStr: '7:00 PM', location: "Bob's", description: '', food: '', sidesOpen: false };
const GAMES = [
  { id: '293296', title: 'Splendor: Marvel', taken: 0, max: 4 },
  { id: '368974', title: 'Vienna',           taken: 4, max: 4 },
];

describe('formatTime', () => {
  it('converts 24h HH:MM to 12h with AM/PM', () => {
    expect(formatTime('19:00')).toBe('7:00 PM');
    expect(formatTime('00:30')).toBe('12:30 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime('9:05')).toBe('9:05 AM');
  });
  it('passes through anything that is not HH:MM', () => {
    expect(formatTime('7pm')).toBe('7pm');
    expect(formatTime('6:30 PM')).toBe('6:30 PM');
    expect(formatTime('')).toBe('');
    expect(formatTime(undefined)).toBe('');
    expect(formatTime('25:00')).toBe('25:00');
  });
});

describe('gamesCtx', () => {
  it('flattens selectedGames into title/seat rows and skips entries without a title', () => {
    const night = { selectedGames: {
      a: { title: 'Catan', maxPlayers: 4, signedUpPlayers: [{ userId: 'x' }] },
      b: { maxPlayers: 2, signedUpPlayers: [] },                  // legacy, no title
      c: { title: 'Ra' },                                         // no arrays at all
    } };
    expect(gamesCtx(night)).toEqual({ games: [
      { id: 'a', title: 'Catan', taken: 1, max: 4 },
      { id: 'c', title: 'Ra',    taken: 0, max: 4 },
    ] });
  });
  it('is empty for a night with no games', () => {
    expect(gamesCtx({})).toEqual({ games: [] });
    expect(gamesCtx({ selectedGames: {} })).toEqual({ games: [] });
  });
});

describe.each([
  ['buildInviteHtml', buildInviteHtml, 'html'],
  ['buildHtml',       buildHtml,       'html'],
  ['buildInviteText', buildInviteText, 'text'],
  ['buildText',       buildText,       'text'],
])('%s', (_name, build, kind) => {
  it('lists every game with its seat count', () => {
    const out = build({ ...BASE, games: GAMES, rsvpLinks: LINKS });
    expect(out).toContain('Games on the table');
    expect(out).toContain('Splendor: Marvel');
    expect(out).toContain('Vienna');
    expect(out).toContain('0/4');
    expect(out).toContain('4/4');
  });

  it('gives open games a Join link and full games none', () => {
    const out = build({ ...BASE, games: GAMES, rsvpLinks: LINKS });
    expect(out).toContain(LINKS.join('293296'));
    expect(out).not.toContain(LINKS.join('368974'));
    if (kind === 'html') expect(out).toContain('>Full<');
  });

  it('omits the block when there are no games', () => {
    expect(build({ ...BASE, games: [], rsvpLinks: LINKS })).not.toContain('Games on the table');
    expect(build({ ...BASE, rsvpLinks: LINKS })).not.toContain('Games on the table');
  });

  it('still lists games when links could not be minted', () => {
    const out = build({ ...BASE, games: GAMES, rsvpLinks: null });
    expect(out).toContain('Splendor: Marvel');
    expect(out).not.toContain('https://x/j');
  });

  if (kind === 'html') {
    it('escapes game titles', () => {
      const out = build({ ...BASE, games: [{ id: 'z', title: '<script>alert(1)</script>', taken: 0, max: 4 }], rsvpLinks: LINKS });
      expect(out).not.toContain('<script>');
      expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });
    it('does not use the fork-and-knife emoji (renders as a box in Gmail)', () => {
      const out = build({ ...BASE, food: 'Gumbo', rsvpLinks: LINKS });
      expect(out).not.toContain('🍽');
      expect(out).toContain('Food:');
    });
  }
});

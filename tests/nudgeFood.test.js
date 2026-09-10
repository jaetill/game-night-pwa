// lambda/nudge.js — food plan + "pick your games" link in invite and nudge
// emails.
//
// Before this, the email rendered night.description but silently dropped
// night.food (the "Food plan" field), so "making chili, bring a side" never
// reached anyone who didn't sign in. These tests lock in that both email
// bodies (text + HTML, invite + nudge) carry the food plan, that the side
// sign-up line only appears when the host allows sides, and that the whole
// thing stays escaped.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nudge = require('../lambda/nudge.js');
const {
  _buildHtml: buildHtml,
  _buildInviteHtml: buildInviteHtml,
  _buildText: buildText,
  _buildInviteText: buildInviteText,
  _foodCtx: foodCtx,
} = nudge;

const LINKS = { yes: 'https://x/y', ifNeeded: 'https://x/i', no: 'https://x/n', games: 'https://x/g' };
const BASE  = { name: 'Alice', hostName: 'Bob', dateStr: 'Saturday, September 26', timeStr: '6:30 PM', location: "Bob's", description: '' };

describe('foodCtx', () => {
  it('sidesOpen requires both a food plan and allowSides', () => {
    expect(foodCtx({ food: 'Chili', allowSides: true })).toEqual({ food: 'Chili', sidesOpen: true });
    expect(foodCtx({ food: 'Chili', allowSides: false })).toEqual({ food: 'Chili', sidesOpen: false });
    expect(foodCtx({ food: null, allowSides: true })).toEqual({ food: '', sidesOpen: false });
    expect(foodCtx({})).toEqual({ food: '', sidesOpen: false });
  });
});

describe.each([
  ['buildInviteHtml', buildInviteHtml, 'html'],
  ['buildHtml',       buildHtml,       'html'],
  ['buildInviteText', buildInviteText, 'text'],
  ['buildText',       buildText,       'text'],
])('%s', (_name, build, kind) => {
  it('includes the food plan when present', () => {
    const out = build({ ...BASE, food: 'Chili and cornbread', sidesOpen: false, rsvpLinks: LINKS });
    expect(out).toContain('Chili and cornbread');
    expect(out).toContain('bring your own meal');
    expect(out).not.toContain('Bringing a side?');
  });

  it('adds the side sign-up line pointing at the picker link when sidesOpen', () => {
    const out = build({ ...BASE, food: 'Chili', sidesOpen: true, rsvpLinks: LINKS });
    expect(out).toContain('Bringing a side?');
    expect(out).toContain(LINKS.games);
  });

  it('omits the food block entirely when there is no food plan', () => {
    const out = build({ ...BASE, food: '', sidesOpen: false, rsvpLinks: LINKS });
    expect(out).not.toContain('Food');
    expect(out).not.toContain('bring your own meal');
  });

  it('links to the game picker from the RSVP block', () => {
    const out = build({ ...BASE, rsvpLinks: LINKS });
    expect(out).toContain(LINKS.games);
  });

  it('still renders when rsvpLinks is null (best-effort token build failed)', () => {
    const out = build({ ...BASE, food: 'Chili', sidesOpen: true, rsvpLinks: null });
    expect(out).toContain('Chili');
    expect(out).toContain('Bringing a side?');
    expect(out).toContain(kind === 'html' ? 'Sign up in the app' : 'Sign up in the app');
  });

  if (kind === 'html') {
    it('escapes the food plan', () => {
      const out = build({ ...BASE, food: '<b onmouseover=alert(1)>Chili</b>', sidesOpen: false, rsvpLinks: LINKS });
      expect(out).not.toContain('<b onmouseover');
      expect(out).toContain('&lt;b onmouseover=alert(1)&gt;Chili&lt;/b&gt;');
    });
  }
});

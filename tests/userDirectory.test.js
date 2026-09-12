// src/js/utils/userDirectory.js — one entry per person in "Recent guests".
//
// An invite is stored as an email in night.invited[]; once that person signs
// in and RSVPs they appear as a Cognito userId in night.rsvps[]. Jason's
// Recent guests list showed most people twice (email + username) because
// nothing tied the two together. RSVP entries now carry `email`; this file
// builds the map and collapses invite keys through it.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildDirectoryFromNights,
  resolveGuestKey,
  getDisplayName,
  _resetDirectoryForTest,
} from '../src/js/utils/userDirectory.js';

const NIGHTS = [
  { id: 'a', invited: ['deb@example.com', 'phil@example.com'], rsvps: [] },
  { id: 'b', invited: [], rsvps: [
    { userId: 'deb-uuid',  name: 'Deb',  type: 'playing', email: 'Deb@Example.com' },
    { userId: 'legacy-uuid', name: 'Legacy', type: 'playing' },           // pre-#367, no email
    { userId: 'junk-uuid', name: 'Junk', type: 'playing', email: 'not-an-email' },
  ] },
];

beforeEach(() => { _resetDirectoryForTest(); buildDirectoryFromNights(NIGHTS); });

describe('resolveGuestKey', () => {
  it('collapses a known email (any case) to its userId', () => {
    expect(resolveGuestKey('deb@example.com')).toBe('deb-uuid');
    expect(resolveGuestKey('DEB@EXAMPLE.COM')).toBe('deb-uuid');
  });
  it('leaves unknown emails and userIds alone', () => {
    expect(resolveGuestKey('phil@example.com')).toBe('phil@example.com');
    expect(resolveGuestKey('legacy-uuid')).toBe('legacy-uuid');
    expect(resolveGuestKey(undefined)).toBeUndefined();
  });
  it('ignores rsvp.email values that are not email-shaped', () => {
    expect(resolveGuestKey('not-an-email')).toBe('not-an-email');
  });
});

describe('getDisplayName', () => {
  it('resolves an email through to the name of the user it belongs to', () => {
    expect(getDisplayName('deb@example.com')).toBe('Deb');
    expect(getDisplayName('deb-uuid')).toBe('Deb');
  });
  it('falls back to the raw value when unknown', () => {
    expect(getDisplayName('phil@example.com')).toBe('phil@example.com');
    expect(getDisplayName('nobody')).toBe('nobody');
  });
});

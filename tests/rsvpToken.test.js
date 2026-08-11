import { describe, it, expect } from 'vitest';
import { signRsvpToken, verifyRsvpToken } from '../lambda/lib/rsvpToken.js';

const SECRET = 'test-secret-not-real';

describe('rsvpToken sign/verify', () => {
  const payload = { nightId: 'n1', invitee: 'deb@example.com', exp: Date.now() + 60_000 };

  it('round-trips a valid token', () => {
    const token = signRsvpToken(payload, SECRET);
    expect(verifyRsvpToken(token, SECRET)).toEqual(payload);
  });

  it('rejects a tampered body', () => {
    const token = signRsvpToken(payload, SECRET);
    const [body, mac] = token.split('.');
    const evil = Buffer.from(JSON.stringify({ ...payload, invitee: 'attacker@example.com' })).toString('base64url');
    expect(verifyRsvpToken(`${evil}.${mac}`, SECRET)).toBeNull();
    expect(verifyRsvpToken(`${body}.AAAA${mac.slice(4)}`, SECRET)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signRsvpToken(payload, 'other-secret');
    expect(verifyRsvpToken(token, SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signRsvpToken({ ...payload, exp: Date.now() - 1000 }, SECRET);
    expect(verifyRsvpToken(token, SECRET)).toBeNull();
  });

  it('accepts a token with no exp (never expires)', () => {
    const noExp = { nightId: payload.nightId, invitee: payload.invitee };
    const token = signRsvpToken(noExp, SECRET);
    expect(verifyRsvpToken(token, SECRET)).toEqual(noExp);
  });

  it('rejects garbage inputs without throwing', () => {
    expect(verifyRsvpToken(null, SECRET)).toBeNull();
    expect(verifyRsvpToken('', SECRET)).toBeNull();
    expect(verifyRsvpToken('a.b.c', SECRET)).toBeNull();
    expect(verifyRsvpToken('notbase64!!.alsonot!!', SECRET)).toBeNull();
    expect(verifyRsvpToken('x'.repeat(3000), SECRET)).toBeNull();
  });
});

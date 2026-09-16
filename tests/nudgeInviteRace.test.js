// lambda/nudge.js — ensureGuest: the /invite write to gameNights.json is
// ETag-conditional and retries on a lost race.
//
// Why: the app invites N guests by saving the night once and firing N
// parallel POST /invite calls. Each call used to load the file, push its
// one guest, and PutObject the whole thing back with no precondition — so
// one call loading a moment before the host's save landed would overwrite
// an 8-guest invited[] with a 1-guest one. That happened on 2026-09-12 and
// looked, from the host's side, like six people had silently declined.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nudge = require('../lambda/nudge.js');
const { _ensureGuest: ensureGuest } = nudge;
const by = (email) => ({ email, invitedBy: 'host' });
const emails = (nights) => nights[0].guests.map(g => g.email);

const NIGHT_ID = 'n1';

// A tiny in-memory S3 with ETag versioning: GET returns {ETag, Body};
// PUT with IfMatch != current ETag throws PreconditionFailed.
function fakeS3(initialNights) {
  let body = JSON.stringify(initialNights);
  let version = 1;
  const puts = [];
  const s3 = {
    puts,
    current: () => JSON.parse(body),
    send: vi.fn(async (cmd) => {
      if (cmd.input?.Body !== undefined) {
        puts.push({ ...cmd.input });
        if (cmd.input.IfMatch !== undefined && cmd.input.IfMatch !== `"v${version}"`) {
          const err = new Error('PreconditionFailed'); err.name = 'PreconditionFailed';
          err.$metadata = { httpStatusCode: 412 };
          throw err;
        }
        body = cmd.input.Body; version++;
        return {};
      }
      return { ETag: `"v${version}"`, Body: { transformToString: async () => body } };
    }),
  };
  return s3;
}

afterEach(() => { nudge._resetForTest(); vi.restoreAllMocks(); });

describe('ensureGuest', () => {
  it('appends a pending entry with an If-Match write and reports changed', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, hostUserId: 'host', invited: ['a@example.com'] }]);
    nudge._setForTest({ s3 });
    const r = await ensureGuest(NIGHT_ID, by('b@example.com'));
    expect(r.changed).toBe(true);
    expect(r.guest).toMatchObject({ email: 'b@example.com', userId: null, invitedBy: 'host', response: null });
    expect(s3.puts).toHaveLength(1);
    expect(s3.puts[0].IfMatch).toBe('"v1"');
    expect(emails(s3.current())).toEqual(['a@example.com', 'b@example.com']);
    // Legacy array folded into guests[] and dropped.
    expect(s3.current()[0].invited).toBeUndefined();
  });

  it('is a no-op (no write) when the person is already on the list, case-insensitively', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, hostUserId: 'host', guests: [
      { id: 'g1', userId: null, name: null, email: 'deb@example.com', invitedBy: 'host', invitedAt: 1, response: null, respondedAt: null },
    ] }]);
    nudge._setForTest({ s3 });
    const r = await ensureGuest(NIGHT_ID, by('Deb@Example.com'));
    expect(r.changed).toBe(false);
    expect(r.guest.id).toBe('g1');
    expect(s3.puts).toHaveLength(0);
  });

  it('fills in the userId on an existing email-only entry instead of adding a second person', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, hostUserId: 'host', guests: [
      { id: 'g1', userId: null, name: null, email: 'deb@example.com', invitedBy: 'host', invitedAt: 1, response: null, respondedAt: null },
    ] }]);
    nudge._setForTest({ s3 });
    const r = await ensureGuest(NIGHT_ID, { userId: 'deb-uuid', email: 'deb@example.com', name: 'Deb', invitedBy: 'host' });
    expect(r.changed).toBe(true);
    expect(s3.current()[0].guests).toHaveLength(1);
    expect(s3.current()[0].guests[0]).toMatchObject({ id: 'g1', userId: 'deb-uuid', name: 'Deb' });
  });

  it('re-reads and retries when the write loses a race, keeping the other writer\'s change', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, hostUserId: 'host', guests: [] }]);
    // Sabotage: between our GET and our PUT, someone else saves 8 guests.
    const others = Array.from({ length: 8 }, (_, i) => `g${i}@example.com`);
    let interfered = false;
    const realSend = s3.send;
    s3.send = vi.fn(async (cmd) => {
      if (cmd.input?.Body !== undefined && !interfered) {
        interfered = true;
        const cur = s3.current();
        cur[0].guests = others.map((e, i) => ({ id: `o${i}`, userId: null, name: null, email: e, invitedBy: 'host', invitedAt: 1, response: null, respondedAt: null }));
        await realSend({ input: { Body: JSON.stringify(cur), IfMatch: '"v1"' } });
      }
      return realSend(cmd);
    });
    nudge._setForTest({ s3 });

    const r = await ensureGuest(NIGHT_ID, by('me@example.com'));
    expect(r.changed).toBe(true);
    // The 8 guests survived and ours was appended — nothing was clobbered.
    expect(emails(s3.current())).toEqual([...others, 'me@example.com']);
    // Our first PUT was refused (stale ETag), the second went through.
    const mine = s3.puts.filter(p => emails(JSON.parse(p.Body)).includes('me@example.com'));
    expect(mine).toHaveLength(2);
    expect(mine[0].IfMatch).toBe('"v1"');
    expect(mine[1].IfMatch).toBe('"v2"');
  });

  it('eight parallel invites all land', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, hostUserId: 'host', guests: [] }]);
    nudge._setForTest({ s3 });
    const keys = Array.from({ length: 8 }, (_, i) => `g${i}@example.com`);
    await Promise.all(keys.map(k => ensureGuest(NIGHT_ID, by(k), 10)));
    expect([...emails(s3.current())].sort()).toEqual([...keys].sort());
  });

  it('gives up after maxAttempts lost races with the last error', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, guests: [] }]);
    s3.send = vi.fn(async (cmd) => {
      if (cmd.input?.Body !== undefined) {
        const err = new Error('PreconditionFailed'); err.name = 'PreconditionFailed'; throw err;
      }
      return { ETag: '"v1"', Body: { transformToString: async () => JSON.stringify([{ id: NIGHT_ID, guests: [] }]) } };
    });
    nudge._setForTest({ s3 });
    await expect(ensureGuest(NIGHT_ID, by('x@example.com'), 2)).rejects.toThrow('PreconditionFailed');
  });

  it('rethrows non-race S3 errors immediately', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, guests: [] }]);
    s3.send = vi.fn(async (cmd) => {
      if (cmd.input?.Body !== undefined) throw new Error('AccessDenied');
      return { ETag: '"v1"', Body: { transformToString: async () => JSON.stringify([{ id: NIGHT_ID, guests: [] }]) } };
    });
    nudge._setForTest({ s3 });
    await expect(ensureGuest(NIGHT_ID, by('x@example.com'))).rejects.toThrow('AccessDenied');
    expect(s3.send.mock.calls.filter(c => c[0].input?.Body !== undefined)).toHaveLength(1);
  });
});

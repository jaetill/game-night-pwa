// lambda/nudge.js — ensureInvited: the /invite write to gameNights.json is
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
const { _ensureInvited: ensureInvited } = nudge;

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

describe('ensureInvited', () => {
  it('adds the key with an If-Match write and reports changed', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, invited: ['a@example.com'] }]);
    nudge._setForTest({ s3 });
    const r = await ensureInvited(NIGHT_ID, 'b@example.com');
    expect(r.changed).toBe(true);
    expect(s3.puts).toHaveLength(1);
    expect(s3.puts[0].IfMatch).toBe('"v1"');
    expect(s3.current()[0].invited).toEqual(['a@example.com', 'b@example.com']);
  });

  it('is a no-op (no write) when the key is already present, case-insensitively', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, invited: ['Deb@Example.com'] }]);
    nudge._setForTest({ s3 });
    const r = await ensureInvited(NIGHT_ID, 'deb@example.com');
    expect(r.changed).toBe(false);
    expect(s3.puts).toHaveLength(0);
  });

  it('re-reads and retries when the write loses a race, keeping the other writer\'s change', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, invited: [] }]);
    // Sabotage: between our GET and our PUT, someone else saves 8 guests.
    const others = Array.from({ length: 8 }, (_, i) => `g${i}@example.com`);
    let interfered = false;
    const realSend = s3.send;
    s3.send = vi.fn(async (cmd) => {
      if (cmd.input?.Body !== undefined && !interfered) {
        interfered = true;
        const cur = s3.current(); cur[0].invited = others;
        await realSend({ input: { Body: JSON.stringify(cur), IfMatch: '"v1"' } });
      }
      return realSend(cmd);
    });
    nudge._setForTest({ s3 });

    const r = await ensureInvited(NIGHT_ID, 'me@example.com');
    expect(r.changed).toBe(true);
    // The 8 guests survived and ours was appended — nothing was clobbered.
    expect(s3.current()[0].invited).toEqual([...others, 'me@example.com']);
    // Our first PUT was refused (stale ETag), the second went through.
    const mine = s3.puts.filter(p => JSON.parse(p.Body)[0].invited.includes('me@example.com'));
    expect(mine).toHaveLength(2);
    expect(mine[0].IfMatch).toBe('"v1"');
    expect(mine[1].IfMatch).toBe('"v2"');
  });

  it('eight parallel invites all land', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, invited: [] }]);
    nudge._setForTest({ s3 });
    const keys = Array.from({ length: 8 }, (_, i) => `g${i}@example.com`);
    // With a fake S3 that resolves synchronously-ish, interleaving is limited,
    // but every call still has to survive whatever ordering it gets.
    await Promise.all(keys.map(k => ensureInvited(NIGHT_ID, k, 10)));
    expect([...s3.current()[0].invited].sort()).toEqual([...keys].sort());
  });

  it('gives up after maxAttempts lost races with the last error', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, invited: [] }]);
    s3.send = vi.fn(async (cmd) => {
      if (cmd.input?.Body !== undefined) {
        const err = new Error('PreconditionFailed'); err.name = 'PreconditionFailed'; throw err;
      }
      return { ETag: '"v1"', Body: { transformToString: async () => JSON.stringify([{ id: NIGHT_ID, invited: [] }]) } };
    });
    nudge._setForTest({ s3 });
    await expect(ensureInvited(NIGHT_ID, 'x@example.com', 2)).rejects.toThrow('PreconditionFailed');
  });

  it('rethrows non-race S3 errors immediately', async () => {
    const s3 = fakeS3([{ id: NIGHT_ID, invited: [] }]);
    s3.send = vi.fn(async (cmd) => {
      if (cmd.input?.Body !== undefined) throw new Error('AccessDenied');
      return { ETag: '"v1"', Body: { transformToString: async () => JSON.stringify([{ id: NIGHT_ID, invited: [] }]) } };
    });
    nudge._setForTest({ s3 });
    await expect(ensureInvited(NIGHT_ID, 'x@example.com')).rejects.toThrow('AccessDenied');
    expect(s3.send.mock.calls.filter(c => c[0].input?.Body !== undefined)).toHaveLength(1);
  });
});

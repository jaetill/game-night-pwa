// Tests for lambda/createEvent.js — generateEventId and handler smoke test.
//
// The key change in this PR is replacing Math.random() with crypto.randomBytes(4)
// for event ID generation. These tests verify the format contract and uniqueness
// properties of generateEventId(), and guard against regression to the old
// Math.random()-based approach.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { generateEventId, handler } = require('../lambda/createEvent.js');

describe('generateEventId', () => {
  it('returns a string', () => {
    expect(typeof generateEventId()).toBe('string');
  });

  it('matches the expected format: <base36-timestamp>-<8-hex-chars>', () => {
    const id = generateEventId();
    // Format: base36 timestamp (variable length) + hyphen + exactly 8 hex chars
    expect(id).toMatch(/^[0-9a-z]+-[0-9a-f]{8}$/);
  });

  it('hex suffix is exactly 8 characters (4 bytes from randomBytes)', () => {
    const id = generateEventId();
    const hex = id.split('-')[1];
    expect(hex).toHaveLength(8);
  });

  it('generates unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, generateEventId));
    expect(ids.size).toBe(20);
  });

  it('hex suffix only contains valid hex characters', () => {
    for (let i = 0; i < 10; i++) {
      const id = generateEventId();
      const hex = id.split('-')[1];
      expect(hex).toMatch(/^[0-9a-f]+$/);
    }
  });

  it('timestamp prefix is base36 (no uppercase, no hex-only chars like g-z)', () => {
    const id = generateEventId();
    const prefix = id.split('-')[0];
    // base36 uses 0-9 and a-z
    expect(prefix).toMatch(/^[0-9a-z]+$/);
    // Must be non-empty
    expect(prefix.length).toBeGreaterThan(0);
  });

  it('timestamp prefix encodes a recent timestamp (within 1 minute of now)', () => {
    const before = Date.now();
    const id = generateEventId();
    const after = Date.now();

    const prefix = id.split('-')[0];
    const decoded = parseInt(prefix, 36);

    expect(decoded).toBeGreaterThanOrEqual(before);
    expect(decoded).toBeLessThanOrEqual(after);
  });

  it('does not use Math.random (hex suffix differs from what Math.random would produce)', () => {
    // Spy on Math.random to confirm it is NOT called by generateEventId
    const spy = vi.spyOn(Math, 'random');
    generateEventId();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Handler tests ──────────────────────────────────────────────────────────
// Two categories:
//   1. Source-level regression guard: asserts the handler source does not call
//      toUpperCase() on generateEventId(). vi.mock can't intercept CJS require()
//      calls made via createRequire (vitest only intercepts ESM imports), so the
//      behavioral test for the 201-with-lowercase-ID path uses source analysis.
//   2. Input-validation tests for paths that return BEFORE any S3 call — these
//      run against the real handler without needing an S3 mock.

function makeHandlerEvent(body, opts = {}) {
  return {
    httpMethod: 'POST',
    resource: '/create-event',
    headers: { origin: 'https://gamenights.jaetill.com', ...(opts.headers || {}) },
    requestContext: { authorizer: { userId: opts.userId || 'testhost' } },
    body: JSON.stringify(body),
  };
}

const CTX = { awsRequestId: 'test-req-id' };

describe('createEvent handler — source regression guard', () => {
  it('event ID is not uppercased: generateEventId() result must not have toUpperCase() applied', () => {
    // This test directly guards against the regression where the handler calls
    // generateEventId().toUpperCase(), which would produce IDs like
    // 'M9K3Z7-1A2B3C4D' instead of the expected lowercase 'm9k3z7-1a2b3c4d'.
    // Client-side code compares IDs case-sensitively; uppercase IDs break lookups.
    const { readFileSync } = require('node:fs');
    const source = readFileSync(
      require.resolve('../lambda/createEvent.js'),
      'utf-8',
    );
    expect(source).not.toMatch(/generateEventId\(\)\.toUpperCase\(\)/);
  });
});

describe('createEvent handler — input validation (no S3 needed)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 with CORS Allow-Methods for OPTIONS preflight', async () => {
    const res = await handler(
      { httpMethod: 'OPTIONS', headers: { origin: 'https://gamenights.jaetill.com' }, requestContext: {}, body: null },
      CTX,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  it('returns 401 when the authorizer userId is absent', async () => {
    const res = await handler(
      { httpMethod: 'POST', headers: {}, requestContext: {}, body: '{"date":"2026-06-01"}' },
      CTX,
    );
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });

  it('returns 400 for an unparseable JSON body', async () => {
    const res = await handler(
      { httpMethod: 'POST', headers: {}, requestContext: { authorizer: { userId: 'u1' } }, body: 'not-json' },
      CTX,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when the date field is missing', async () => {
    const res = await handler(makeHandlerEvent({ time: '19:00' }), CTX);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('date is required');
  });
});

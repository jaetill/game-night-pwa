// Tests for lambda/feedback.js — POST /feedback handler.
//
// Uses the dependency-injection seam (`_createHandler`) so that mocks for
// SecretsManagerClient and Octokit can be passed in without touching the
// require chain. Each test gets its own handler instance, so rate-limit state
// doesn't leak between tests.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _createHandler, _validate } = require('../lambda/feedback.js');

// ── Mock factories ─────────────────────────────────────────────────────────
function makeMockSm({ secretValue = { GITHUB_TOKEN: 'ghp_fake' }, fail = false } = {}) {
  return {
    send: vi.fn(async () => {
      if (fail) throw new Error('SecretsManager unavailable');
      return { SecretString: JSON.stringify(secretValue) };
    }),
  };
}

function makeMockOctokit({ failStatus = null } = {}) {
  const captured = [];
  class MockOctokit {
    constructor(opts) {
      this.opts = opts;
    }
    rest = {
      issues: {
        create: vi.fn(async (params) => {
          captured.push(params);
          if (failStatus) {
            const err = new Error('GitHub API error');
            err.status = failStatus;
            throw err;
          }
          return {
            data: {
              number: 42,
              html_url: 'https://github.com/jaetill/game-night-pwa/issues/42',
            },
          };
        }),
      },
    };
  }
  return { Octokit: MockOctokit, captured };
}

function makeEvent(method, body, opts = {}) {
  return {
    httpMethod: method,
    resource: '/feedback',
    headers: { origin: 'https://gamenights.jaetill.com', ...(opts.headers || {}) },
    requestContext: { identity: { sourceIp: opts.ip || '1.2.3.4' } },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

const VALID_BODY = {
  type: 'bug',
  description: 'Found a really annoying issue when I try to submit my RSVP and the page just hangs.',
  email: 'tester@example.com',
};

describe('lambda/feedback.js — handler', () => {
  beforeEach(() => {
    // Silence the structured logger so test output stays readable;
    // restoreAllMocks() in afterEach unwinds the spy.
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── OPTIONS / method gating ───────────────────────────────
  it('OPTIONS returns 200 with CORS headers', async () => {
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: makeMockOctokit().Octokit });
    const res = await handler(makeEvent('OPTIONS', '{}'), { awsRequestId: 'rid-opt' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  it('non-POST methods return 405', async () => {
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: makeMockOctokit().Octokit });
    const res = await handler(makeEvent('GET', '{}'), { awsRequestId: 'rid-get' });
    expect(res.statusCode).toBe(405);
  });

  // ── Validation ─────────────────────────────────────────────
  it('rejects malformed JSON with 400', async () => {
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: makeMockOctokit().Octokit });
    const res = await handler(makeEvent('POST', 'not json'), { awsRequestId: 'rid-json' });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_json');
  });

  it('rejects unknown type with 400', async () => {
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: makeMockOctokit().Octokit });
    const res = await handler(makeEvent('POST', { ...VALID_BODY, type: 'spam' }), { awsRequestId: 'rid-type' });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('validation_error');
  });

  it('rejects too-short description', async () => {
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: makeMockOctokit().Octokit });
    const res = await handler(makeEvent('POST', { ...VALID_BODY, description: 'short' }), { awsRequestId: 'rid-len' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects malformed email', async () => {
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: makeMockOctokit().Octokit });
    const res = await handler(makeEvent('POST', { ...VALID_BODY, email: 'no-at-sign' }), { awsRequestId: 'rid-email' });
    expect(res.statusCode).toBe(400);
  });

  // ── Honeypot ───────────────────────────────────────────────
  it('honeypot field returns 201 but does NOT create a GitHub issue', async () => {
    const ok = makeMockOctokit();
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: ok.Octokit });
    const res = await handler(makeEvent('POST', { ...VALID_BODY, website: 'spam-bot-input' }), { awsRequestId: 'rid-honey' });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).id).toMatch(/^FB-DROPPED-/);
    expect(ok.captured.length).toBe(0);
  });

  // ── Happy path ─────────────────────────────────────────────
  it('valid submission returns 201 with feedback ID and creates a GitHub issue', async () => {
    const ok = makeMockOctokit();
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: ok.Octokit });
    const res = await handler(makeEvent('POST', VALID_BODY), { awsRequestId: 'rid-happy' });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toMatch(/^FB-\d{4}-000042$/);
    // Response intentionally omits issue_url — see lambda/feedback.js
    // (security-review LOW: don't leak internal repo structure to anon callers).
    expect(body.issue_url).toBeUndefined();
    expect(ok.captured.length).toBe(1);
    expect(ok.captured[0].title).toContain('[bug]');
    expect(ok.captured[0].labels).toEqual(expect.arrayContaining(['feedback:user-submitted', 'type:bug']));
  });

  it('long descriptions are truncated in the issue title', async () => {
    const ok = makeMockOctokit();
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: ok.Octokit });
    const longDesc = 'x'.repeat(500);
    await handler(makeEvent('POST', { ...VALID_BODY, description: longDesc }), { awsRequestId: 'rid-long' });
    expect(ok.captured.length).toBe(1);
    const title = ok.captured[0].title;
    expect(title.length).toBeLessThan(120);
    expect(title).toContain('...');
  });

  // ── Failures ───────────────────────────────────────────────
  it('GitHub API failure returns 502', async () => {
    const handler = _createHandler({
      smClient: makeMockSm(),
      Octokit: makeMockOctokit({ failStatus: 503 }).Octokit,
    });
    const res = await handler(makeEvent('POST', VALID_BODY), { awsRequestId: 'rid-gh-fail' });
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error).toBe('github_issue_creation_failed');
  });

  it('Secrets Manager failure returns 500', async () => {
    const handler = _createHandler({
      smClient: makeMockSm({ fail: true }),
      Octokit: makeMockOctokit().Octokit,
    });
    const res = await handler(makeEvent('POST', VALID_BODY), { awsRequestId: 'rid-sm-fail' });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe('configuration_error');
  });

  it('missing GITHUB_TOKEN in secret returns 500', async () => {
    const handler = _createHandler({
      smClient: makeMockSm({ secretValue: { /* token missing */ } }),
      Octokit: makeMockOctokit().Octokit,
    });
    const res = await handler(makeEvent('POST', VALID_BODY), { awsRequestId: 'rid-no-token' });
    expect(res.statusCode).toBe(500);
  });

  // ── Rate limiting ──────────────────────────────────────────
  it('rate limits the 11th request from the same IP within 1 hour', async () => {
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: makeMockOctokit().Octokit });
    const ip = '9.9.9.9';
    for (let i = 0; i < 10; i++) {
      const res = await handler(makeEvent('POST', VALID_BODY, { ip }), { awsRequestId: `rid-rl-${i}` });
      expect(res.statusCode).toBe(201);
    }
    const eleventh = await handler(makeEvent('POST', VALID_BODY, { ip }), { awsRequestId: 'rid-rl-11' });
    expect(eleventh.statusCode).toBe(429);
    expect(JSON.parse(eleventh.body).error).toBe('rate_limited');
    expect(eleventh.headers['Retry-After']).toBeDefined();
  });

  it('different IPs do not share rate-limit buckets', async () => {
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: makeMockOctokit().Octokit });
    for (let i = 0; i < 10; i++) {
      await handler(makeEvent('POST', VALID_BODY, { ip: '1.1.1.1' }), { awsRequestId: `rid-a-${i}` });
    }
    const otherIp = await handler(makeEvent('POST', VALID_BODY, { ip: '2.2.2.2' }), { awsRequestId: 'rid-b-1' });
    expect(otherIp.statusCode).toBe(201);
  });
});

describe('lambda/feedback.js — _validate helper', () => {
  it('passes valid input', () => {
    expect(_validate(VALID_BODY)).toBeNull();
  });

  it('rejects missing type', () => {
    expect(_validate({ description: 'a'.repeat(15) })).toMatch(/type/);
  });

  it('rejects oversized description', () => {
    expect(_validate({ type: 'bug', description: 'a'.repeat(2001) })).toMatch(/2000/);
  });

  it('rejects oversized page_url', () => {
    expect(_validate({ ...VALID_BODY, page_url: 'a'.repeat(3000) })).toMatch(/page_url/);
  });
});

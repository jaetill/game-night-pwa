// Tests for lambda/feedback.js — POST /feedback handler.
//
// Uses the dependency-injection seam (`_createHandler`) so that mocks for
// SecretsManagerClient and Octokit can be passed in without touching the
// require chain. Each test gets its own handler instance, so rate-limit state
// doesn't leak between tests.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _createHandler, _validate, _escapeMarkdown, _isSafePageUrl, _makeDynamoRateLimiter } = require('../lambda/feedback.js');

// ── DynamoDB mock factory ──────────────────────────────────────────────────
// Simulates DynamoDB UpdateItem with an in-process counter map keyed by the
// same pk the real limiter uses.  Returned `getCount(pk)` lets tests inspect
// the accumulated state without hitting a real table.
function makeMockDynamo({ fail = false } = {}) {
  const counts = new Map();
  const client = {
    send: vi.fn(async (cmd) => {
      if (fail) throw new Error('DynamoDB unavailable');
      const pk = cmd.input.Key.pk.S;
      const next = (counts.get(pk) || 0) + 1;
      counts.set(pk, next);
      return {
        Attributes: {
          count: { N: String(next) },
          ttl: { N: String(Math.floor(Date.now() / 1000) + 7200) },
        },
      };
    }),
  };
  return { client, getCount: (pk) => counts.get(pk) || 0 };
}

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

  // ── CORS origin gating ────────────────────────────────────
  it('localhost origin is echoed when DEPLOY_ENV is not prod', async () => {
    // ALLOWED_ORIGINS is a module-level constant evaluated at require() time, so
    // exercising the non-prod branch requires a fresh module load. Both caches
    // must be cleared: vi.resetModules() for Vitest's ESM interop registry and
    // require.cache for Node's native CJS cache (used by createRequire).
    vi.resetModules();
    const feedbackPath = require.resolve('../lambda/feedback.js');
    delete require.cache[feedbackPath];
    process.env.DEPLOY_ENV = 'dev';
    try {
      const { _createHandler } = require('../lambda/feedback.js');
      const handler = _createHandler({ smClient: makeMockSm(), Octokit: makeMockOctokit().Octokit });
      const res = await handler(
        makeEvent('OPTIONS', '{}', { headers: { origin: 'http://localhost:5173' } }),
        { awsRequestId: 'rid-localhost-nonprod' },
      );
      expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    } finally {
      delete process.env.DEPLOY_ENV;
      delete require.cache[feedbackPath];
      vi.resetModules();
    }
  });

  it('localhost origin is echoed when DEPLOY_ENV is staging', async () => {
    vi.resetModules();
    const feedbackPath = require.resolve('../lambda/feedback.js');
    delete require.cache[feedbackPath];
    process.env.DEPLOY_ENV = 'staging';
    try {
      const { _createHandler } = require('../lambda/feedback.js');
      const handler = _createHandler({ smClient: makeMockSm(), Octokit: makeMockOctokit().Octokit });
      const res = await handler(
        makeEvent('OPTIONS', '{}', { headers: { origin: 'http://localhost:5173' } }),
        { awsRequestId: 'rid-localhost-staging' },
      );
      expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    } finally {
      delete process.env.DEPLOY_ENV;
      delete require.cache[feedbackPath];
      vi.resetModules();
    }
  });

  it('localhost origin blocked when DEPLOY_ENV is a typo (Prod, PROD, production)', async () => {
    for (const typo of ['Prod', 'PROD', 'production']) {
      vi.resetModules();
      const feedbackPath = require.resolve('../lambda/feedback.js');
      delete require.cache[feedbackPath];
      process.env.DEPLOY_ENV = typo;
      try {
        const { _createHandler } = require('../lambda/feedback.js');
        const handler = _createHandler({ smClient: makeMockSm(), Octokit: makeMockOctokit().Octokit });
        const res = await handler(
          makeEvent('OPTIONS', '{}', { headers: { origin: 'http://localhost:5173' } }),
          { awsRequestId: `rid-typo-${typo}` },
        );
        expect(res.headers['Access-Control-Allow-Origin'], `DEPLOY_ENV=${typo} must not echo localhost`).not.toBe('http://localhost:5173');
      } finally {
        delete process.env.DEPLOY_ENV;
        delete require.cache[feedbackPath];
        vi.resetModules();
      }
    }
  });

  it('localhost origin gets fallback CORS header when DEPLOY_ENV is unset (defaults to prod)', async () => {
    // DEPLOY_ENV is not set in the test environment, so it defaults to 'prod',
    // which excludes http://localhost:5173 from ALLOWED_ORIGINS. A request from
    // localhost must receive the production fallback origin, not the local origin.
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: makeMockOctokit().Octokit });
    const res = await handler(
      makeEvent('OPTIONS', '{}', { headers: { origin: 'http://localhost:5173' } }),
      { awsRequestId: 'rid-localhost-cors' },
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://gamenights.jaetill.com');
    expect(res.headers['Access-Control-Allow-Origin']).not.toBe('http://localhost:5173');
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

  it('submitter email is NOT included in the public GitHub issue body', async () => {
    const ok = makeMockOctokit();
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: ok.Octokit });
    const res = await handler(makeEvent('POST', VALID_BODY), { awsRequestId: 'rid-no-email' });
    expect(res.statusCode).toBe(201);
    expect(ok.captured.length).toBe(1);
    expect(ok.captured[0].body).not.toContain('tester@example.com');
    expect(ok.captured[0].body).not.toContain('Email:');
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

describe('lambda/feedback.js — Markdown injection prevention', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('escapes Markdown special chars in issue title when description contains them', async () => {
    const ok = makeMockOctokit();
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: ok.Octokit });
    const maliciousDesc = '## Fake heading [phish](http://evil.com) ![img](http://tracker.example)';
    const res = await handler(makeEvent('POST', { ...VALID_BODY, description: maliciousDesc }), { awsRequestId: 'rid-title-escape' });
    expect(res.statusCode).toBe(201);
    expect(ok.captured.length).toBe(1);
    const { title, body } = ok.captured[0];
    expect(title).not.toContain('## Fake heading');
    expect(title).not.toMatch(/\[phish\]\(http/);
    expect(title).not.toMatch(/!\[img\]/);
    expect(body).not.toContain('## Fake heading');
    expect(body).not.toMatch(/\[phish\]\(http/);
    expect(body).not.toMatch(/!\[img\]/);
  });

  it('escapes Markdown special chars in safe-origin page_url before embedding in issue body', async () => {
    const ok = makeMockOctokit();
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: ok.Octokit });
    // Safe-origin URL with Markdown-special chars in query string
    const urlWithMarkdown = 'https://gamenights.jaetill.com/path?q=<value>&x=`code`';
    const res = await handler(makeEvent('POST', { ...VALID_BODY, page_url: urlWithMarkdown }), { awsRequestId: 'rid-url-escape' });
    expect(res.statusCode).toBe(201);
    const { body } = ok.captured[0];
    expect(body).not.toContain('<value>');
    expect(body).not.toContain('`code`');
    expect(body).toContain('\\<value\\>');
  });

  it('escapes backticks in user_agent so code-span injection cannot occur', async () => {
    const ok = makeMockOctokit();
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: ok.Octokit });
    const maliciousUA = 'Mozilla/5.0` injected-after-code-span `leftover';
    const res = await handler(makeEvent('POST', { ...VALID_BODY, user_agent: maliciousUA }), { awsRequestId: 'rid-ua-escape' });
    expect(res.statusCode).toBe(201);
    const { body } = ok.captured[0];
    expect(body).not.toContain('` injected-after-code-span `');
    expect(body).toContain('\\`');
  });
});

describe('lambda/feedback.js — _escapeMarkdown helper', () => {
  it('escapes all Markdown-special characters', () => {
    expect(_escapeMarkdown('*bold* _italic_ #heading [link](url) `code` <tag> ![img](src)')).toBe(
      '\\*bold\\* \\_italic\\_ \\#heading \\[link\\](url) \\`code\\` \\<tag\\> \\!\\[img\\](src)'
    );
  });

  it('escapes backslash to prevent double-escaping', () => {
    expect(_escapeMarkdown('back\\slash')).toBe('back\\\\slash');
  });

  it('escapes pipe to prevent Markdown table injection', () => {
    expect(_escapeMarkdown('col1 | col2 | col3')).toBe('col1 \\| col2 \\| col3');
  });

  it('returns plain strings unchanged', () => {
    expect(_escapeMarkdown('hello world 123')).toBe('hello world 123');
  });
});

describe('lambda/feedback.js — page_url origin validation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes page_url from known app origin in GitHub issue body', async () => {
    const ok = makeMockOctokit();
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: ok.Octokit });
    const safeUrl = 'https://gamenights.jaetill.com/';
    const res = await handler(makeEvent('POST', { ...VALID_BODY, page_url: safeUrl }), { awsRequestId: 'rid-safe-url' });
    expect(res.statusCode).toBe(201);
    const { body } = ok.captured[0];
    expect(body).toContain('Page:');
    expect(body).toContain('gamenights.jaetill.com');
  });

  it('omits page_url from external / phishing origin', async () => {
    const ok = makeMockOctokit();
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: ok.Octokit });
    const phishUrl = 'https://evil.example.com/fake-login';
    const res = await handler(makeEvent('POST', { ...VALID_BODY, page_url: phishUrl }), { awsRequestId: 'rid-phish-url' });
    expect(res.statusCode).toBe(201);
    const { body } = ok.captured[0];
    expect(body).not.toContain('evil.example.com');
    expect(body).not.toContain('Page:');
  });

  it('omits page_url that mimics a safe origin via path prefix spoofing', async () => {
    const ok = makeMockOctokit();
    const handler = _createHandler({ smClient: makeMockSm(), Octokit: ok.Octokit });
    // Evil URL starts with a path segment that looks like the safe origin but is not
    const spoofUrl = 'https://evil.com/https://gamenights.jaetill.com/';
    const res = await handler(makeEvent('POST', { ...VALID_BODY, page_url: spoofUrl }), { awsRequestId: 'rid-spoof-url' });
    expect(res.statusCode).toBe(201);
    const { body } = ok.captured[0];
    expect(body).not.toContain('evil.com');
    expect(body).not.toContain('Page:');
  });
});

describe('lambda/feedback.js — _isSafePageUrl helper', () => {
  it('accepts URLs rooted at the primary app origin', () => {
    expect(_isSafePageUrl('https://gamenights.jaetill.com/')).toBe(true);
    expect(_isSafePageUrl('https://gamenights.jaetill.com/some/path?q=1')).toBe(true);
  });

  it('accepts URLs rooted at the GitHub Pages origin', () => {
    expect(_isSafePageUrl('https://jaetill.github.io/game-night-pwa/')).toBe(true);
    expect(_isSafePageUrl('https://jaetill.github.io/game-night-pwa/callback.html')).toBe(true);
  });

  it('rejects external URLs', () => {
    expect(_isSafePageUrl('https://evil.example.com/')).toBe(false);
    expect(_isSafePageUrl('http://gamenights.jaetill.com/')).toBe(false); // wrong scheme
  });

  it('rejects non-string inputs', () => {
    expect(_isSafePageUrl(null)).toBe(false);
    expect(_isSafePageUrl(undefined)).toBe(false);
    expect(_isSafePageUrl(42)).toBe(false);
  });

  // Regression guard for the domain-suffix spoofing bypass that the
  // initial startsWith-based implementation allowed. See PR #58
  // code-review finding.
  it('rejects domain-suffix spoofing (gamenights.jaetill.com.evil.com)', () => {
    expect(_isSafePageUrl('https://gamenights.jaetill.com.evil.example/')).toBe(false);
    expect(_isSafePageUrl('https://gamenights.jaetill.com.attacker.test/path')).toBe(false);
  });

  it('rejects GitHub Pages spoofing (jaetill.github.io.evil.com or wrong project path)', () => {
    expect(_isSafePageUrl('https://jaetill.github.io.evil.example/game-night-pwa/')).toBe(false);
    expect(_isSafePageUrl('https://jaetill.github.io/other-project/')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(_isSafePageUrl('not-a-url')).toBe(false);
    expect(_isSafePageUrl('javascript:alert(1)')).toBe(false);
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

describe('lambda/feedback.js — DynamoDB-backed rate limiter', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks the 11th request from the same IP via DynamoDB counter', async () => {
    const { client: dynamo } = makeMockDynamo();
    const handler = _createHandler({
      smClient: makeMockSm(),
      Octokit: makeMockOctokit().Octokit,
      dynamoClient: dynamo,
    });
    const ip = '5.6.7.8';
    for (let i = 0; i < 10; i++) {
      const res = await handler(makeEvent('POST', VALID_BODY, { ip }), { awsRequestId: `rid-drl-${i}` });
      expect(res.statusCode).toBe(201);
    }
    const eleventh = await handler(makeEvent('POST', VALID_BODY, { ip }), { awsRequestId: 'rid-drl-11' });
    expect(eleventh.statusCode).toBe(429);
    expect(JSON.parse(eleventh.body).error).toBe('rate_limited');
    expect(eleventh.headers['Retry-After']).toBeDefined();
  });

  it('different IPs use separate DynamoDB counters', async () => {
    const { client: dynamo } = makeMockDynamo();
    const handler = _createHandler({
      smClient: makeMockSm(),
      Octokit: makeMockOctokit().Octokit,
      dynamoClient: dynamo,
    });
    for (let i = 0; i < 10; i++) {
      await handler(makeEvent('POST', VALID_BODY, { ip: '10.0.0.1' }), { awsRequestId: `rid-a-${i}` });
    }
    const otherIp = await handler(makeEvent('POST', VALID_BODY, { ip: '10.0.0.2' }), { awsRequestId: 'rid-b-1' });
    expect(otherIp.statusCode).toBe(201);
  });

  it('falls back to in-memory limiter when DynamoDB throws', async () => {
    const { client: dynamo } = makeMockDynamo({ fail: true });
    const handler = _createHandler({
      smClient: makeMockSm(),
      Octokit: makeMockOctokit().Octokit,
      dynamoClient: dynamo,
    });
    // In-memory fallback should allow the request through
    const res = await handler(makeEvent('POST', VALID_BODY), { awsRequestId: 'rid-ddb-fail' });
    expect(res.statusCode).toBe(201);
  });

  it('DynamoDB client receives UpdateItem with ADD expression and TTL', async () => {
    const { client: dynamo } = makeMockDynamo();
    const handler = _createHandler({
      smClient: makeMockSm(),
      Octokit: makeMockOctokit().Octokit,
      dynamoClient: dynamo,
    });
    await handler(makeEvent('POST', VALID_BODY, { ip: '3.3.3.3' }), { awsRequestId: 'rid-ddb-inspect' });
    expect(dynamo.send).toHaveBeenCalledOnce();
    const cmd = dynamo.send.mock.calls[0][0];
    expect(cmd.input.UpdateExpression).toContain('ADD');
    expect(cmd.input.UpdateExpression).toContain('if_not_exists');
    expect(cmd.input.ExpressionAttributeValues[':ttl']).toBeDefined();
    expect(cmd.input.Key.pk.S).toMatch(/^rl#3\.3\.3\.3#/);
  });
});

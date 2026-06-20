// Unit tests for HTML-escaping in lambda/nudge.js buildHtml.
//
// Regression guard: buildHtml was interpolating user-supplied fields raw,
// while buildInviteHtml already called escapeHtml. This test locks in the
// fix so any future edit that removes escapeHtml calls breaks loudly here.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nudge = require('../lambda/nudge.js');
const {
  _buildHtml: buildHtml,
  _buildInviteHtml: buildInviteHtml,
  _escapeHtml: escapeHtml,
  _isValidInviteEmail: isValidInviteEmail,
  _makeNudgeErrorEntry: makeNudgeErrorEntry,
} = nudge;

const BASE = {
  name: 'Alice',
  hostName: 'Bob',
  dateStr: 'Saturday, May 15',
  timeStr: '7:00 PM',
  location: 'Bob\'s Place',
  description: 'Bring your favourite games.',
};

describe('isValidInviteEmail', () => {
  // Unified validator combining issue #22 (Cognito filter injection — no double-quotes)
  // and issue #23 (string/length guard so non-strings don't throw on .includes).

  it('accepts a normal email address', () => {
    expect(isValidInviteEmail('alice@example.com')).toBe(true);
  });

  it('accepts a well-formed email (alt)', () => {
    expect(isValidInviteEmail('user@example.com')).toBe(true);
  });

  it('rejects undefined', () => {
    expect(isValidInviteEmail(undefined)).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidInviteEmail(null)).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidInviteEmail('')).toBe(false);
  });

  it('rejects an address with no @ sign', () => {
    expect(isValidInviteEmail('notanemail')).toBe(false);
  });

  it('rejects an email containing a double-quote (Cognito filter injection)', () => {
    expect(isValidInviteEmail('foo"@bar.com')).toBe(false);
  });

  it('rejects an email where the double-quote is mid-address', () => {
    expect(isValidInviteEmail('a"b@example.com')).toBe(false);
  });

  it('rejects a crafted filter-escape payload', () => {
    // Payload that would break the ListUsers filter: email = "x" OR "1"="1"
    expect(isValidInviteEmail('x" OR "1"="1')).toBe(false);
  });

  it('rejects an array — would throw TypeError on old .includes guard', () => {
    expect(isValidInviteEmail(['user@example.com'])).toBe(false);
  });

  it('rejects a plain object', () => {
    expect(isValidInviteEmail({ email: 'user@example.com' })).toBe(false);
  });

  it('rejects a number', () => {
    expect(isValidInviteEmail(42)).toBe(false);
  });

  it('rejects a string longer than 254 characters', () => {
    const long = 'a'.repeat(245) + '@b.com'; // 251 chars — under cap
    const tooLong = 'a'.repeat(249) + '@b.com'; // 255 chars — over cap
    expect(isValidInviteEmail(long)).toBe(true);
    expect(isValidInviteEmail(tooLong)).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('encodes the five dangerous characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles null/undefined gracefully', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('buildHtml XSS escaping', () => {
  it('escapes <script> in hostName', () => {
    const html = buildHtml({ ...BASE, hostName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes <b> tag in location', () => {
    const html = buildHtml({ ...BASE, location: 'A<b>B</b>C' });
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('escapes HTML in description', () => {
    const html = buildHtml({ ...BASE, description: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('escapes HTML in name (greeting)', () => {
    const html = buildHtml({ ...BASE, name: '<em>Alice</em>' });
    expect(html).not.toContain('<em>');
    expect(html).toContain('&lt;em&gt;');
  });

  it('escapes HTML in dateStr', () => {
    const html = buildHtml({ ...BASE, dateStr: '&amp;<b>Friday</b>' });
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('escapes HTML in timeStr', () => {
    const html = buildHtml({ ...BASE, timeStr: '7:00<br>PM' });
    expect(html).not.toContain('<br>');
    expect(html).toContain('&lt;br&gt;');
  });

  it('escapes hostName in both occurrences', () => {
    const html = buildHtml({ ...BASE, hostName: '<b>Evil</b>' });
    // Two uses: "reminded by" and "Let X know"
    expect(html.indexOf('<b>')).toBe(-1);
    const count = (html.match(/&lt;b&gt;Evil&lt;\/b&gt;/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('renders benign inputs without mangling them', () => {
    const html = buildHtml(BASE);
    expect(html).toContain('Bob');
    // apostrophe is legitimately encoded by escapeHtml
    expect(html).toContain('Bob&#39;s Place');
    expect(html).toContain('Bring your favourite games.');
  });
});

describe('buildInviteHtml XSS escaping', () => {
  // Regression guard for code-review findings #20 and #21 — same class of
  // bug as buildHtml; the implementer's first PR fixed buildHtml only,
  // reviewer caught that buildInviteHtml had the same gap.

  it('escapes a malicious hostName', () => {
    const html = buildInviteHtml({ ...BASE, hostName: '<script>alert(1)</script>' });
    expect(html.indexOf('<script>')).toBe(-1);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes a malicious dateStr (finding #20)', () => {
    const html = buildInviteHtml({ ...BASE, dateStr: '<img src=x onerror=alert(1)>' });
    expect(html.indexOf('<img src=x')).toBe(-1);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes a malicious timeStr (finding #20)', () => {
    const html = buildInviteHtml({ ...BASE, timeStr: '<svg onload=alert(1)>' });
    expect(html.indexOf('<svg onload')).toBe(-1);
    expect(html).toContain('&lt;svg onload=alert(1)&gt;');
  });

  it('escapes a malicious name in the greeting (finding #21)', () => {
    const html = buildInviteHtml({ ...BASE, name: '<em>Mallory</em>' });
    expect(html.indexOf('<em>Mallory</em>')).toBe(-1);
    expect(html).toContain('Hi &lt;em&gt;Mallory&lt;/em&gt;!');
  });

  it('escapes a malicious location', () => {
    const html = buildInviteHtml({ ...BASE, location: '<b>Pwn</b>ed' });
    expect(html.indexOf('<b>Pwn</b>')).toBe(-1);
    expect(html).toContain('&lt;b&gt;Pwn&lt;/b&gt;ed');
  });

  it('escapes a malicious description', () => {
    const html = buildInviteHtml({ ...BASE, description: '<iframe src=evil></iframe>' });
    expect(html.indexOf('<iframe')).toBe(-1);
    expect(html).toContain('&lt;iframe src=evil&gt;&lt;/iframe&gt;');
  });

  it('escapes hostName in both occurrences (invite + RSVP prompt)', () => {
    const html = buildInviteHtml({ ...BASE, hostName: '<x>' });
    expect(html.indexOf('<x>')).toBe(-1);
    const count = (html.match(/&lt;x&gt;/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('renders benign inputs cleanly', () => {
    const html = buildInviteHtml(BASE);
    expect(html).toContain('Bob');
    expect(html).toContain('Bob&#39;s Place');
    expect(html).toContain('Bring your favourite games.');
  });
});

describe('makeNudgeErrorEntry (PII guard — issue #44)', () => {
  it('does not include the invitee email address', () => {
    const entry = makeNudgeErrorEntry(new Error('delivery failed'));
    expect(Object.keys(entry)).not.toContain('email');
  });

  it('includes the error message', () => {
    const entry = makeNudgeErrorEntry(new Error('postmark timeout'));
    expect(entry.error).toBe('postmark timeout');
  });

  it('returns only the error field (no extra keys)', () => {
    const entry = makeNudgeErrorEntry(new Error('x'));
    expect(Object.keys(entry)).toEqual(['error']);
  });
});

// Handler-level behavioral test for invite Postmark failure scrubbing (issue #72).
// The static text-pattern check in errorMessageScrubbing.test.js won't survive a
// catch-block refactor that reintroduces the leak; this test exercises the actual
// handler response end-to-end via the _setForTest seam.
describe('handler invite — Postmark failure scrubbing (issue #72)', () => {
  const NIGHT = {
    id: 'night-1',
    hostUserId: 'host-user',
    invited: [],
    rsvps: [],
    declined: [],
    date: '2026-06-01',
    time: '7:00 PM',
    location: "Alice's Place",
    description: '',
  };

  function makeInviteEvent() {
    return {
      httpMethod: 'POST',
      resource: '/invite',
      headers: { origin: 'https://gamenights.jaetill.com' },
      requestContext: { authorizer: { userId: 'host-user' } },
      body: JSON.stringify({ nightId: 'night-1', action: 'invite', email: 'newguest@example.com' }),
    };
  }

  let mockSm, mockS3, mockCognito;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockSm = {
      send: vi.fn(async () => ({ SecretString: JSON.stringify({ POSTMARK_API_KEY: 'test-key' }) })),
    };

    mockS3 = {
      send: vi.fn(async (cmd) => {
        if (cmd.input?.Body !== undefined) return {};
        return { Body: { transformToString: async () => JSON.stringify([NIGHT]) } };
      }),
    };

    mockCognito = {
      send: vi.fn(async (cmd) => {
        if (cmd.input?.Filter)             return { Users: [] };
        if (cmd.input?.TemporaryPassword)  return {};
        if (cmd.input?.GroupName)          return {};
        return { UserAttributes: [{ Name: 'name', Value: 'Alice' }] };
      }),
    };
  });

  afterEach(() => {
    nudge._resetForTest();
    vi.restoreAllMocks();
  });

  it('invite Postmark failure returns generic error, not e.message', async () => {
    nudge._setForTest({
      smClient: mockSm,
      s3: mockS3,
      cognito: mockCognito,
      postmark: async () => { throw new Error('Postmark: bad API key'); },
    });
    const res = await nudge.handler(makeInviteEvent(), { awsRequestId: 'test-invite-500' });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Failed to send invite email');
    expect(res.body).not.toContain('Postmark');
    expect(res.body).not.toContain('bad API key');
  });
});

// Handler-level regression guard for PR #49 (issue #44 PII fix).
// If a future edit restores `errors` in the response body, these tests break.
describe('handler nudge — response body shape (PII regression guard, issue #51)', () => {
  const NIGHT = {
    id: 'night-1',
    hostUserId: 'host-user',
    invited: ['user1-id', 'user2-id'],
    rsvps: [],
    declined: [],
    date: '2026-06-01',
    time: '7:00 PM',
    location: "Alice's Place",
    description: '',
  };

  function makeNudgeEvent() {
    return {
      httpMethod: 'POST',
      resource: '/nudge',
      headers: { origin: 'https://gamenights.jaetill.com' },
      requestContext: { authorizer: { userId: 'host-user' } },
      body: JSON.stringify({ nightId: 'night-1' }),
    };
  }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockS3 = {
      send: vi.fn(async () => ({
        Body: { transformToString: async () => JSON.stringify([NIGHT]) },
      })),
    };

    const mockCognito = {
      send: vi.fn(async (cmd) => {
        const username = cmd.input?.Username;
        if (username === 'host-user') return { UserAttributes: [{ Name: 'name', Value: 'Alice' }] };
        if (username === 'user1-id')  return { UserAttributes: [{ Name: 'email', Value: 'user1@example.com' }, { Name: 'name', Value: 'User One' }] };
        if (username === 'user2-id')  return { UserAttributes: [{ Name: 'email', Value: 'user2@example.com' }, { Name: 'name', Value: 'User Two' }] };
        throw new Error(`Unexpected Cognito call for username: ${username}`);
      }),
    };

    const mockSm = {
      send: vi.fn(async () => ({ SecretString: JSON.stringify({ POSTMARK_API_KEY: 'test-key' }) })),
    };

    let deliveryCallCount = 0;
    const mockPostmark = vi.fn(async () => {
      deliveryCallCount++;
      if (deliveryCallCount >= 2) throw new Error('Postmark delivery failed');
    });

    nudge._setForTest({ smClient: mockSm, s3: mockS3, cognito: mockCognito, postmark: mockPostmark });
  });

  afterEach(() => {
    nudge._resetForTest();
    vi.restoreAllMocks();
  });

  it('uses errorCount (not errors array) in response when a delivery fails', async () => {
    const res = await nudge.handler(makeNudgeEvent(), { awsRequestId: 'test-nudge-shape-1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.errorCount).toBe('number');
    expect(body.errors).toBeUndefined(); // PII regression guard — issue #44
    expect(body.errorCount).toBe(1);
    expect(body.sent).toBe(1);
    expect(body.total).toBe(2);
  });

  it('response body contains no email addresses', async () => {
    const res = await nudge.handler(makeNudgeEvent(), { awsRequestId: 'test-nudge-shape-2' });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/@/); // no email-format strings in the response at all
  });
});

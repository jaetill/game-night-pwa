// Tests for lambda/lib/identity.js — the caller-attribution log fields.
//
// Why this test matters: the whole point of these fields is to survive the
// logger's PII scrubber. A field name that collides with PII_FIELDS, or a
// value that looks email-shaped, gets silently replaced with [REDACTED] —
// producing logs that look attributed but aren't. So the critical assertions
// here run the fields through the REAL logger and check what comes out the
// other side, not just what the helper returns.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { emailHash, identityFields, routeFromMethodArn, HASH_LENGTH } =
  require('../lambda/lib/identity.js');

describe('emailHash', () => {
  it('is stable for the same address', () => {
    expect(emailHash('a@b.com')).toBe(emailHash('a@b.com'));
  });

  it('normalizes case and surrounding whitespace', () => {
    const canonical = emailHash('erinandjacy@gmail.com');
    expect(emailHash('  ErinAndJacy@Gmail.COM  ')).toBe(canonical);
  });

  it('distinguishes different addresses', () => {
    expect(emailHash('a@b.com')).not.toBe(emailHash('c@d.com'));
  });

  it('produces a short hex digest with no @', () => {
    const hash = emailHash('a@b.com');
    expect(hash).toHaveLength(HASH_LENGTH);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('returns undefined for junk input so the field just disappears', () => {
    expect(emailHash(undefined)).toBeUndefined();
    expect(emailHash(null)).toBeUndefined();
    expect(emailHash('')).toBeUndefined();
    expect(emailHash('   ')).toBeUndefined();
    expect(emailHash(42)).toBeUndefined();
  });
});

describe('identityFields', () => {
  it('passes a Cognito UUID through as user_id', () => {
    const fields = identityFields({ userId: '4b9cc6a6-fdc1-445f-b5d9-8f91549d142d' });
    expect(fields.user_id).toBe('4b9cc6a6-fdc1-445f-b5d9-8f91549d142d');
    expect(fields.email_hash).toBeUndefined();
  });

  it('passes a plain username through as user_id', () => {
    expect(identityFields({ userId: 'jaetill' }).user_id).toBe('jaetill');
  });

  it('emits both fields when the email is also known', () => {
    const fields = identityFields({ userId: 'jaetill', email: 'a@b.com' });
    expect(fields.user_id).toBe('jaetill');
    expect(fields.email_hash).toBe(emailHash('a@b.com'));
  });

  // The footgun: rsvpLink's resolveInvitee falls back to using the raw email
  // AS the userId when Cognito has no match. Passing that through unguarded
  // would put an address in `user_id` and get it scrubbed to nothing useful.
  it('never puts an email-shaped userId into user_id', () => {
    const fields = identityFields({ userId: 'erinandjacy@gmail.com' });
    expect(fields.user_id).toBeUndefined();
    expect(fields.email_hash).toBe(emailHash('erinandjacy@gmail.com'));
  });

  it('returns an empty object when nothing is known', () => {
    expect(identityFields({})).toEqual({});
    expect(identityFields()).toEqual({});
  });
});

describe('routeFromMethodArn', () => {
  it('renders verb and path', () => {
    expect(routeFromMethodArn('arn:aws:execute-api:us-east-2:1:abc/prod/POST/upload-token'))
      .toBe('POST /upload-token');
  });

  it('handles nested paths', () => {
    expect(routeFromMethodArn('arn:aws:execute-api:us-east-2:1:abc/prod/GET/a/b'))
      .toBe('GET /a/b');
  });

  it('degrades quietly on unexpected shapes rather than throwing', () => {
    expect(routeFromMethodArn(undefined)).toBeUndefined();
    expect(routeFromMethodArn('nope')).toBeUndefined();
    expect(routeFromMethodArn('arn/prod/GET')).toBe('GET');
  });
});

describe('survives the logger PII scrubber', () => {
  let logSpy;

  beforeEach(() => {
    process.env.LOG_LEVEL = 'DEBUG';
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => logSpy.mockRestore());

  function freshLogger() {
    delete require.cache[require.resolve('../lambda/lib/logger.js')];
    return require('../lambda/lib/logger.js');
  }

  function lastLogged() {
    const callArgs = logSpy.mock.calls[logSpy.mock.calls.length - 1];
    return JSON.parse(callArgs[0]);
  }

  it('keeps user_id and email_hash intact through a real log call', () => {
    const logger = freshLogger();
    logger.info('auth.allowed', {
      auth_mode: 'jwt',
      route: 'POST /upload-token',
      ...identityFields({ userId: 'f6d36b10-80fa-4d0b-9cd9-db19d7459995', email: 'a@b.com' }),
    });

    const record = lastLogged();
    expect(record.user_id).toBe('f6d36b10-80fa-4d0b-9cd9-db19d7459995');
    expect(record.email_hash).toBe(emailHash('a@b.com'));
    expect(record.email_hash).not.toBe('[REDACTED]');
    expect(record.route).toBe('POST /upload-token');
  });

  it('leaks no raw address even when the caller only had an email', () => {
    const logger = freshLogger();
    logger.info('rsvp_link.attempt', identityFields({ userId: 'erinandjacy@gmail.com' }));

    const serialized = JSON.stringify(lastLogged());
    expect(serialized).not.toContain('erinandjacy');
    expect(serialized).not.toContain('@');
    expect(lastLogged().email_hash).toBe(emailHash('erinandjacy@gmail.com'));
  });
});

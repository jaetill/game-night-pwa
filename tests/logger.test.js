// Tests for the structured-logger PII scrubbing.
//
// Why this test matters: the logger emits to console.log, which Sentry's
// default consoleIntegration captures as breadcrumbs. If a field name slips
// past PII_FIELDS or an upstream error message contains an email, the data
// lands in Sentry on the next captureException. The scrubbing here is the
// last line of defense before that.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Re-require after env changes so the logger picks them up.
function freshLogger() {
  delete require.cache[require.resolve('../lambda/lib/logger.js')];
  return require('../lambda/lib/logger.js');
}

describe('lambda/lib/logger.js — PII scrubbing', () => {
  let logSpy;

  beforeEach(() => {
    process.env.LOG_LEVEL = 'DEBUG'; // ensure debug logs aren't filtered out
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function lastLogged() {
    const callArgs = logSpy.mock.calls[logSpy.mock.calls.length - 1];
    return JSON.parse(callArgs[0]);
  }

  it('redacts top-level email field', () => {
    const logger = freshLogger();
    logger.info('test', { email: 'jaetill@gmail.com' });
    expect(lastLogged().email).toBe('[REDACTED]');
  });

  it('redacts tempPassword (not just the legacy temporaryPassword name)', () => {
    const logger = freshLogger();
    logger.info('test', { tempPassword: 'Hunter2!XYZ' });
    expect(lastLogged().tempPassword).toBe('[REDACTED]');
  });

  it('redacts inviteEmail, signInEmail, contactEmail, bggUsername, address', () => {
    const logger = freshLogger();
    logger.info('test', {
      inviteEmail: 'a@b.com',
      signInEmail: 'c@d.com',
      contactEmail: 'e@f.com',
      bggUsername: 'jaetill',
      address: '123 Main St',
    });
    const out = lastLogged();
    expect(out.inviteEmail).toBe('[REDACTED]');
    expect(out.signInEmail).toBe('[REDACTED]');
    expect(out.contactEmail).toBe('[REDACTED]');
    expect(out.bggUsername).toBe('[REDACTED]');
    expect(out.address).toBe('[REDACTED]');
  });

  it('scrubs email patterns inside string values (e.g. error messages)', () => {
    const logger = freshLogger();
    logger.error('postmark.failed', { error: 'Could not send to user@example.com — bounced' });
    expect(lastLogged().error).toBe('Could not send to [REDACTED_EMAIL] — bounced');
  });

  it('scrubs JWT-shaped strings inside string values', () => {
    const logger = freshLogger();
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.4Adcj3UFYzPUVaVF43FmMze5GCV5Tx5Vh5g3Sl9b8sM';
    logger.error('auth.failed', { error: `Token ${token} expired` });
    expect(lastLogged().error).toBe('Token [REDACTED_JWT] expired');
  });

  it('preserves non-PII fields unchanged', () => {
    const logger = freshLogger();
    logger.info('event.created', { request_id: 'abc-123', count: 5, ok: true });
    const out = lastLogged();
    expect(out.request_id).toBe('abc-123');
    expect(out.count).toBe(5);
    expect(out.ok).toBe(true);
  });

  it('attaches OTEL-style metadata to every record', () => {
    const logger = freshLogger();
    logger.info('test', { request_id: 'r-1' });
    const out = lastLogged();
    expect(out).toHaveProperty('timestamp');
    expect(out).toHaveProperty('severity_text', 'INFO');
    expect(out).toHaveProperty('severity_number', 20);
    expect(out).toHaveProperty('service.name');
    expect(out).toHaveProperty('deployment.environment');
  });

  it('respects LOG_LEVEL filter (debug suppressed when LOG_LEVEL=INFO)', () => {
    process.env.LOG_LEVEL = 'INFO';
    const logger = freshLogger();
    logger.debug('should be suppressed', {});
    logger.info('should appear', {});
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0]).message).toBe('should appear');
  });
});

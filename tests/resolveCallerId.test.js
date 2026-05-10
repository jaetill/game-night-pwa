// Tests for lambda/lib/resolveCallerId.js
//
// This helper was simplified from a two-path implementation (authorizer context
// OR JWT decode from Authorization header) to a single trusted path
// (authorizer context only). These tests guard against regression to the
// old JWT-decode fallback, which was a footgun: it would silently trust an
// unverified payload if the helper were ever used outside an authorizer
// context. (Security-review finding on PR #3.)

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveCallerId } = require('../lambda/lib/resolveCallerId.js');

describe('resolveCallerId', () => {
  // ── Happy path ────────────────────────────────────────────────────────────

  it('returns userId from requestContext.authorizer.userId', () => {
    const event = {
      requestContext: { authorizer: { userId: 'jaetill' } },
    };
    expect(resolveCallerId(event)).toBe('jaetill');
  });

  it('returns any non-empty userId string verbatim', () => {
    const event = {
      requestContext: { authorizer: { userId: 'uuid-user-abc123' } },
    };
    expect(resolveCallerId(event)).toBe('uuid-user-abc123');
  });

  // ── Missing / partial context → null ─────────────────────────────────────

  it('returns null when authorizer has no userId', () => {
    const event = {
      requestContext: { authorizer: {} },
    };
    expect(resolveCallerId(event)).toBeNull();
  });

  it('returns null when authorizer is missing', () => {
    const event = { requestContext: {} };
    expect(resolveCallerId(event)).toBeNull();
  });

  it('returns null when requestContext is missing', () => {
    const event = {};
    expect(resolveCallerId(event)).toBeNull();
  });

  it('returns null for null event', () => {
    expect(resolveCallerId(null)).toBeNull();
  });

  it('returns null for undefined event', () => {
    expect(resolveCallerId(undefined)).toBeNull();
  });

  // ── Regression guard: NO JWT fallback ────────────────────────────────────
  //
  // The old implementation decoded the Authorization Bearer token payload
  // without verifying the signature. The new implementation must NOT do this,
  // even when a valid-looking Authorization header is present and
  // requestContext.authorizer.userId is absent.

  it('does not fall back to Authorization header when authorizer context is absent', () => {
    // Build a JWT-shaped token where cognito:username = 'hacker'
    const payload = Buffer.from(JSON.stringify({ 'cognito:username': 'hacker', sub: 'hacker-sub' })).toString('base64url');
    const fakeJwt = `header.${payload}.sig`;

    const event = {
      requestContext: {},
      headers: { Authorization: `Bearer ${fakeJwt}` },
    };
    // Must return null — NOT 'hacker'
    expect(resolveCallerId(event)).toBeNull();
  });

  it('does not fall back to lowercase authorization header', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'sneaky' })).toString('base64url');
    const fakeJwt = `h.${payload}.s`;

    const event = {
      requestContext: {},
      headers: { authorization: `Bearer ${fakeJwt}` },
    };
    expect(resolveCallerId(event)).toBeNull();
  });

  it('does not fall back to Authorization header even when authorizer key exists but userId is falsy', () => {
    const payload = Buffer.from(JSON.stringify({ 'cognito:username': 'should-not-appear' })).toString('base64url');
    const fakeJwt = `h.${payload}.s`;

    const event = {
      requestContext: { authorizer: { userId: '' } },
      headers: { Authorization: `Bearer ${fakeJwt}` },
    };
    // Empty string is falsy → null, NOT the JWT payload value
    expect(resolveCallerId(event)).toBeNull();
  });
});

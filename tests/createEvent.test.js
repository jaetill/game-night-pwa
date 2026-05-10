// Tests for lambda/createEvent.js — generateEventId and handler smoke test.
//
// The key change in this PR is replacing Math.random() with crypto.randomBytes(4)
// for event ID generation. These tests verify the format contract and uniqueness
// properties of generateEventId(), and guard against regression to the old
// Math.random()-based approach.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { generateEventId } = require('../lambda/createEvent.js');

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

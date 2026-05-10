// Smoke test: every Lambda handler must load and expose a callable handler.
//
// Why this test exists: Phase 5 wrapped each handler with Sentry.wrapHandler +
// the structured logger. A typo in the wrapper (e.g. missing closing paren,
// wrong import) breaks the module at load time, not at AWS invocation time —
// which is exactly when the test should catch it.
//
// What this test does NOT cover:
//   - actual Lambda behavior (those tests would need AWS SDK mocks)
//   - Sentry capturing exceptions (Sentry is no-op without SENTRY_DSN)
//
// What this test DOES cover:
//   - module loads without throwing
//   - exports.handler (or `handler` for ESM) is a function
//   - Sentry.init runs cleanly with empty DSN

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const cjsHandlers = [
  'apiKeyAuthorizer',
  'nudge',
  'GeneratePresignedGetUrl',
  'GeneratePresignedPost',
  'createEvent',
  'searchGames',
  'groups',
  'feedback',
];

describe('lambda handlers load', () => {
  for (const name of cjsHandlers) {
    it(`${name}.js loads and exports a handler function`, () => {
      const mod = require(`../lambda/${name}.js`);
      expect(typeof mod.handler).toBe('function');
    });
  }

  it('bggProxy.mjs loads and exports a handler function', async () => {
    const mod = await import('../lambda/bggProxy.mjs');
    expect(typeof mod.handler).toBe('function');
  });
});

// Regression guard for issue #45 — internal S3/AWS error messages must
// not leak into 500 API response bodies.
//
// The fix: catch blocks across bggProxy.mjs, GeneratePresignedGetUrl.js,
// and GeneratePresignedPost.js previously returned `{ error: err.message }`
// in the 500 response. AWS SDK error strings can embed bucket names,
// S3 key paths, request IDs, and partial ARNs — information disclosure
// to authenticated callers exceeds the response contract.
//
// All affected paths now return `{ error: 'storage_error' }`. The detail
// is still logged via the structured logger (CloudWatch + Sentry) above
// each return; no observability is lost.
//
// This test is a static (source-text) check rather than a behavior test.
// The Lambdas in question don't have a DI seam, and mocking the AWS SDK
// would be heavier than the regression risk warrants. If someone removes
// the scrubbing — or adds a new 500 path with `err.message` interpolation —
// this test breaks loudly.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const lambdaDir = join(__dirname, '..', 'lambda');
const fixturesDir = join(__dirname, 'fixtures');

const files = [
  'bggProxy.mjs',
  'GeneratePresignedGetUrl.js',
  'GeneratePresignedPost.js',
];

// Matches any catch-binding identifier (err, e, error, ex, etc.).
const LEAK_PATTERN = /500[\s\S]{0,200}error:\s*\w+\.message/g;

describe('issue #45 — S3 error messages must not leak in 500 responses', () => {
  for (const f of files) {
    it(`${f} contains no 500 path interpolating <binding>.message into body`, () => {
      const src = readFileSync(join(lambdaDir, f), 'utf8');
      // Look for the bad pattern: any 500 followed soon after by <var>.message
      // in a body field. The 500-to-<var>.message window is bounded to ~200 chars
      // so we don't false-positive across unrelated parts of the file.
      const matches = src.match(LEAK_PATTERN);
      expect(matches).toBeNull();
    });

    it(`${f} returns the 'storage_error' sentinel in catch blocks`, () => {
      const src = readFileSync(join(lambdaDir, f), 'utf8');
      // Each affected file should have at least one storage_error return.
      // bggProxy has 4; GeneratePresigned* have 1 each. Just assert >=1.
      expect(src).toMatch(/error:\s*['"]storage_error['"]/);
    });
  }

  it('guard catches e.message binding (not just err.message)', () => {
    // Verifies the regex is not variable-name-specific — issue #53.
    const src = readFileSync(join(fixturesDir, 'leak-e-message.js'), 'utf8');
    const matches = src.match(LEAK_PATTERN);
    expect(matches).not.toBeNull();
  });
});

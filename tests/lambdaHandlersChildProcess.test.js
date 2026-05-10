// Real-Node-runtime smoke test for the 9 Lambda handlers.
//
// Why this exists in addition to tests/lambdaHandlers.test.js:
//
// vitest uses Vite's loader, which is more permissive than Node's plain CJS
// `require()`. In particular, vitest will happily let a CJS module `require()`
// an ESM-only package (like @octokit/rest v18+), but Lambda's runtime — which
// is plain Node — rejects that with `ERR_REQUIRE_ESM`.
//
// This is the bug that shipped during Phase 7 deploy: feedback.js had
// `require('@octokit/rest')` which passed `tests/lambdaHandlers.test.js`
// inside vitest, then crashed at INIT inside the Lambda. We caught it via
// smoke test on AWS, but a regression test inside CI would have caught it
// before deploy.
//
// This test spawns a child Node process for each handler and `require()`s the
// module via real Node, mirroring what AWS Lambda does. Any ESM-from-CJS
// mismatch fails here.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..');
const lambdaDir = join(repoRoot, 'lambda');

// CJS handlers — `require()` in a child process.
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

// ESM handler — dynamic `import()` in a child process.
const esmHandlers = ['bggProxy.mjs'];

describe('lambda handlers load in real Node runtime', () => {
  for (const name of cjsHandlers) {
    it(`${name}.js loads via require() in a child Node process`, () => {
      // The child runs the same require() Lambda would run at INIT.
      // We assert the handler is a function — same shape check as the
      // in-vitest smoke test, but executed by plain Node.
      const script = `
        const m = require('./${name}.js');
        if (typeof m.handler !== 'function') {
          console.error('handler is ' + typeof m.handler);
          process.exit(2);
        }
        process.exit(0);
      `;
      execFileSync('node', ['-e', script], {
        cwd: lambdaDir,
        stdio: 'pipe',
      });
      // execFileSync throws if exit code != 0; if we reach here, it loaded.
      expect(true).toBe(true);
    });
  }

  for (const name of esmHandlers) {
    it(`${name} loads via import() in a child Node process`, () => {
      const script = `
        import('./${name}').then((m) => {
          if (typeof m.handler !== 'function') {
            console.error('handler is ' + typeof m.handler);
            process.exit(2);
          }
          process.exit(0);
        }).catch((e) => {
          console.error('import failed: ' + e.message);
          process.exit(3);
        });
      `;
      execFileSync('node', ['--input-type=module', '-e', script], {
        cwd: lambdaDir,
        stdio: 'pipe',
      });
      expect(true).toBe(true);
    });
  }
});

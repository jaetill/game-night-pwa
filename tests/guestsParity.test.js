// ADR-0021: the guest-list helpers exist twice — CommonJS for the Lambdas
// (lambda/lib/guests.js) and ESM for the Vite frontend (src/js/data/guests.js).
// They must be byte-identical apart from the module wrapper. If this test
// fails, copy the body of whichever file you edited over the other.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

function body(path) {
  const src = readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');
  const cut = Math.max(src.indexOf('\nmodule.exports = {'), src.indexOf('\nexport {'));
  return src.slice(0, cut).replace(/^'use strict';\n\n/m, '');
}

function exportedNames(path) {
  const src = readFileSync(resolve(process.cwd(), path), 'utf8');
  const m = src.match(/(?:module\.exports = |export )\{([\s\S]*?)\};/);
  return m[1].split(/[,\s]+/).filter(Boolean).sort();
}

describe('guests.js CJS/ESM parity', () => {
  it('bodies are identical', () => {
    expect(body('src/js/data/guests.js')).toBe(body('lambda/lib/guests.js'));
  });
  it('export lists are identical', () => {
    expect(exportedNames('src/js/data/guests.js')).toEqual(exportedNames('lambda/lib/guests.js'));
  });
});

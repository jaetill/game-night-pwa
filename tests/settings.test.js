import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

describe('.claude/settings.json — git force-push deny patterns', () => {
  let deny;

  beforeAll(() => {
    const raw = readFileSync(resolve(process.cwd(), '.claude/settings.json'), 'utf8');
    ({ permissions: { deny } } = JSON.parse(raw));
  });

  it('blocks --force when flag immediately follows push', () => {
    expect(deny).toContain('Bash(git push --force*)');
  });

  it('blocks -f when flag immediately follows push', () => {
    expect(deny).toContain('Bash(git push -f*)');
  });

  it('blocks --force when a positional arg precedes the flag', () => {
    expect(deny).toContain('Bash(git push * --force*)');
  });

  it('blocks -f when a positional arg precedes the flag', () => {
    expect(deny).toContain('Bash(git push * -f*)');
  });
});

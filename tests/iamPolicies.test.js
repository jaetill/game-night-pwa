import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

describe('lambda/iam/bggProxy-inline.json — ListBucket condition operator', () => {
  let policy;

  beforeAll(() => {
    const raw = readFileSync(resolve(process.cwd(), 'lambda/iam/bggProxy-inline.json'), 'utf8');
    policy = JSON.parse(raw);
  });

  it('uses StringLikeIfExists (not StringLike) so s3:ListBucket fires during GetObject on absent keys', () => {
    const stmt = policy.Statement.find((s) => s.Sid === 'ListBucketForExistenceChecks');
    expect(stmt).toBeDefined();
    expect(stmt.Condition).toHaveProperty('StringLikeIfExists');
    expect(stmt.Condition).not.toHaveProperty('StringLike');
  });

  it('scopes the prefix condition to collections/* and profiles/*', () => {
    const stmt = policy.Statement.find((s) => s.Sid === 'ListBucketForExistenceChecks');
    const prefixes = stmt.Condition.StringLikeIfExists['s3:prefix'];
    expect(prefixes).toContain('collections/*');
    expect(prefixes).toContain('profiles/*');
  });
});

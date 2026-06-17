import { describe, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadPolicy(relPath) {
  return JSON.parse(readFileSync(resolve(root, relPath), 'utf-8'));
}

describe('bggProxy IAM policy', () => {
  const tfPolicy = loadPolicy('terraform/envs/prod/iam-policies/bggProxy-S3Access.json');
  const refPolicy = loadPolicy('lambda/iam/bggProxy-inline.json');

  const stmts = (p) => p.Statement;
  const find = (p, sid) => stmts(p).find((s) => s.Sid === sid);

  for (const [label, policy] of [
    ['terraform/envs/prod/iam-policies/bggProxy-S3Access.json', tfPolicy],
    ['lambda/iam/bggProxy-inline.json', refPolicy],
  ]) {
    describe(label, () => {
      it('allows GetObject+PutObject on collections/*', () => {
        const s = find(policy, 'ReadWriteCollections');
        expect(s).toBeDefined();
        expect(s.Action).toContain('s3:GetObject');
        expect(s.Action).toContain('s3:PutObject');
        expect(s.Resource).toBe('arn:aws:s3:::jaetill-game-nights/collections/*');
      });

      it('allows GetObject+PutObject on profiles/*', () => {
        const s = find(policy, 'ReadWriteProfiles');
        expect(s).toBeDefined();
        expect(s.Action).toContain('s3:GetObject');
        expect(s.Action).toContain('s3:PutObject');
        expect(s.Resource).toBe('arn:aws:s3:::jaetill-game-nights/profiles/*');
      });

      it('allows s3:ListBucket on the bucket without a StringLike prefix condition', () => {
        const s = find(policy, 'ListBucketForExistenceChecks');
        expect(s).toBeDefined();
        const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
        expect(actions).toContain('s3:ListBucket');
        expect(s.Resource).toBe('arn:aws:s3:::jaetill-game-nights');
        // StringLike on s3:prefix is absent in GetObject evaluation context — the
        // condition evaluates false and the Allow never fires (issue #124). The
        // statement must be unconditional so S3 can return NoSuchKey instead of
        // AccessDenied when a key is missing.
        expect(s.Condition?.StringLike?.['s3:prefix']).toBeUndefined();
      });
    });
  }

  it('terraform policy and reference policy are identical', () => {
    expect(JSON.stringify(tfPolicy, null, 2)).toBe(JSON.stringify(refPolicy, null, 2));
  });
});

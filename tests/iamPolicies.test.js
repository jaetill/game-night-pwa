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

      it('does not grant s3:ListBucket (code guard handles AccessDenied-as-404, issue #145)', () => {
        const allActions = stmts(policy).flatMap((s) =>
          Array.isArray(s.Action) ? s.Action : [s.Action]
        );
        expect(allActions).not.toContain('s3:ListBucket');
      });
    });
  }

  it('terraform policy and reference policy are identical', () => {
    expect(JSON.stringify(tfPolicy, null, 2)).toBe(JSON.stringify(refPolicy, null, 2));
  });
});

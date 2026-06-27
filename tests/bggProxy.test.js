// Tests for s3Get() in lambda/bggProxy.mjs — AccessDenied catch (issue #125).
//
// When a user has no S3 object yet, AWS returns AccessDenied with a message
// containing 's3:ListBucket' instead of NoSuchKey (IAM-driven 404 masking —
// S3 hides key existence when the caller lacks s3:ListBucket).
// The bggProxy role intentionally omits s3:ListBucket (issue #145, least privilege),
// so this code guard is the primary mechanism for handling missing-object cases.
//
// _s3Get is exported for testing (consistent with the nudge.js _buildHtml pattern).

import { vi, describe, it, expect } from 'vitest';
import { _s3Get } from '../lambda/bggProxy.mjs';

function makeClient(rejectWith) {
  return { send: vi.fn().mockRejectedValueOnce(rejectWith) };
}

function accessDeniedListBucket() {
  return Object.assign(new Error('s3:ListBucket denied'), { name: 'AccessDenied' });
}

describe('_s3Get error handling', () => {
  it('returns notFoundValue when AccessDenied message includes s3:ListBucket', async () => {
    const result = await _s3Get('collections/alice.json', null, makeClient(accessDeniedListBucket()));
    expect(result).toBeNull();
  });

  it('returns notFoundValue when NoSuchKey', async () => {
    const err = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
    const result = await _s3Get('profiles/alice.json', '{}', makeClient(err));
    expect(result).toBe('{}');
  });

  it('rethrows AccessDenied when message does not include s3:ListBucket', async () => {
    const err = Object.assign(new Error('Access Denied'), { name: 'AccessDenied' });
    await expect(_s3Get('key', null, makeClient(err))).rejects.toThrow('Access Denied');
  });

  it('rethrows unexpected S3 errors', async () => {
    await expect(
      _s3Get('key', null, makeClient(new Error('InternalServerError')))
    ).rejects.toThrow('InternalServerError');
  });

  it('returns the object body as a string on success', async () => {
    const body = Buffer.from('{"games":[]}');
    const mockBody = (async function* () { yield body; })();
    const client = { send: vi.fn().mockResolvedValueOnce({ Body: mockBody }) };
    const result = await _s3Get('collections/alice.json', null, client);
    expect(result).toBe('{"games":[]}');
  });
});

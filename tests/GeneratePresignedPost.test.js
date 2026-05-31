// Tests for _loadCurrentNights() in lambda/GeneratePresignedPost.js.
//
// Same IAM gap as bggProxy (issue #81): GetObject on a non-existent key returns
// AccessDenied (not NoSuchKey) when the role lacks s3:ListBucket. The helper must
// treat both as "no data yet" and return [].

import { vi, describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _loadCurrentNights } = require('../lambda/GeneratePresignedPost.js');

function makeClient(rejectWith) {
  return { send: vi.fn().mockRejectedValueOnce(rejectWith) };
}

function accessDeniedListBucket() {
  return Object.assign(new Error('s3:ListBucket denied'), { name: 'AccessDenied' });
}

describe('_loadCurrentNights error handling', () => {
  it('returns [] when AccessDenied message includes s3:ListBucket', async () => {
    const result = await _loadCurrentNights(makeClient(accessDeniedListBucket()));
    expect(result).toEqual([]);
  });

  it('returns [] when NoSuchKey', async () => {
    const err = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
    const result = await _loadCurrentNights(makeClient(err));
    expect(result).toEqual([]);
  });

  it('rethrows AccessDenied when message does not include s3:ListBucket', async () => {
    const err = Object.assign(new Error('Access Denied'), { name: 'AccessDenied' });
    await expect(_loadCurrentNights(makeClient(err))).rejects.toThrow('Access Denied');
  });

  it('rethrows unexpected S3 errors', async () => {
    await expect(
      _loadCurrentNights(makeClient(new Error('InternalServerError')))
    ).rejects.toThrow('InternalServerError');
  });

  it('returns parsed array on success', async () => {
    const nights = [{ id: 'abc', hostUserId: 'alice' }];
    const body   = Buffer.from(JSON.stringify(nights));
    const mockBody = (async function* () { yield body; })();
    const client   = { send: vi.fn().mockResolvedValueOnce({ Body: mockBody }) };
    const result   = await _loadCurrentNights(client);
    expect(result).toEqual(nights);
  });

  it('returns [] when S3 body is not an array', async () => {
    const body     = Buffer.from(JSON.stringify({ not: 'an array' }));
    const mockBody = (async function* () { yield body; })();
    const client   = { send: vi.fn().mockResolvedValueOnce({ Body: mockBody }) };
    const result   = await _loadCurrentNights(client);
    expect(result).toEqual([]);
  });
});

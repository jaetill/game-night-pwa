// Tests for _loadCollection() in lambda/searchGames.js.
//
// When a user has no S3 collection yet, AWS may return AccessDenied with a
// message containing 's3:ListBucket' instead of NoSuchKey (IAM-driven 404
// masking). The handler must return 200 { results: [] } in that case, not 500.

import { vi, describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _loadCollection } = require('../lambda/searchGames.js');

function makeClient(rejectWith) {
  return { send: vi.fn().mockRejectedValueOnce(rejectWith) };
}

function accessDeniedListBucket() {
  return Object.assign(new Error('s3:ListBucket denied'), { name: 'AccessDenied' });
}

describe('_loadCollection error handling', () => {
  it('returns [] when AccessDenied message includes s3:ListBucket', async () => {
    const result = await _loadCollection('alice', makeClient(accessDeniedListBucket()));
    expect(result).toEqual([]);
  });

  it('returns [] when NoSuchKey', async () => {
    const err = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
    const result = await _loadCollection('alice', makeClient(err));
    expect(result).toEqual([]);
  });

  it('rethrows AccessDenied when message does not include s3:ListBucket', async () => {
    const err = Object.assign(new Error('Access Denied'), { name: 'AccessDenied' });
    await expect(_loadCollection('alice', makeClient(err))).rejects.toThrow('Access Denied');
  });

  it('rethrows unexpected S3 errors', async () => {
    await expect(
      _loadCollection('alice', makeClient(new Error('InternalServerError')))
    ).rejects.toThrow('InternalServerError');
  });

  it('returns parsed array on success', async () => {
    const games = [{ id: '1', title: 'Catan', minPlayers: 3, maxPlayers: 4 }];
    const client = {
      send: vi.fn().mockResolvedValueOnce({
        Body: { transformToString: vi.fn().mockResolvedValueOnce(JSON.stringify(games)) },
      }),
    };
    const result = await _loadCollection('alice', client);
    expect(result).toEqual(games);
  });

  it('returns [] when S3 body is not an array', async () => {
    const client = {
      send: vi.fn().mockResolvedValueOnce({
        Body: { transformToString: vi.fn().mockResolvedValueOnce(JSON.stringify({ not: 'an array' })) },
      }),
    };
    const result = await _loadCollection('alice', client);
    expect(result).toEqual([]);
  });
});

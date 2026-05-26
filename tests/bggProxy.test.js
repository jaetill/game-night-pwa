// Tests for lambda/bggProxy.mjs — s3Get error handling.
//
// When bggProxy-role lacks s3:ListBucket, S3 returns AccessDenied (with
// "s3:ListBucket" in the message) instead of NoSuchKey for absent keys.
// The fix treats that specific AccessDenied as notFoundValue so the handler
// returns the expected empty/default response rather than 500.
//
// We test via the exported _s3GetWith(client, key, notFoundValue) seam to
// avoid fighting the lambda/node_modules module-resolution boundary (vi.mock
// for '@aws-sdk/client-s3' would target root/node_modules, not lambda/).

import { describe, it, expect, vi } from 'vitest';
import { _s3GetWith } from '../lambda/bggProxy.mjs';

function s3Error(name, message) {
  return Object.assign(new Error(message), { name });
}

const LIST_BUCKET_DENIED = s3Error(
  'AccessDenied',
  'User: arn:aws:sts::214599503944:assumed-role/bggProxy-role-4m5m0lfj/bggProxy is not authorized to perform: s3:ListBucket on resource: "arn:aws:s3:::jaetill-game-nights" because no identity-based policy allows the s3:ListBucket action',
);

function mockClient(rejection) {
  return { send: vi.fn().mockRejectedValue(rejection) };
}

describe('bggProxy _s3GetWith — error handling', () => {
  it('returns notFoundValue when S3 throws NoSuchKey', async () => {
    const client = mockClient(s3Error('NoSuchKey', 'The specified key does not exist.'));
    await expect(_s3GetWith(client, 'profiles/user.json', null)).resolves.toBeNull();
  });

  it('returns notFoundValue when AccessDenied message includes s3:ListBucket', async () => {
    const client = mockClient(LIST_BUCKET_DENIED);
    await expect(_s3GetWith(client, 'profiles/user.json', null)).resolves.toBeNull();
  });

  it('returns the custom notFoundValue (not always null) on NoSuchKey', async () => {
    const client = mockClient(s3Error('NoSuchKey', 'The specified key does not exist.'));
    await expect(_s3GetWith(client, 'collections/user.json', 'MISSING')).resolves.toBe('MISSING');
  });

  it('re-throws AccessDenied that is unrelated to s3:ListBucket', async () => {
    const client = mockClient(
      s3Error('AccessDenied', 'User is not authorized to perform: s3:GetObject'),
    );
    await expect(_s3GetWith(client, 'profiles/user.json', null)).rejects.toMatchObject({
      name: 'AccessDenied',
    });
  });

  it('re-throws unexpected errors unchanged', async () => {
    const client = mockClient(s3Error('NetworkError', 'Connection refused'));
    await expect(_s3GetWith(client, 'profiles/user.json', null)).rejects.toMatchObject({
      name: 'NetworkError',
    });
  });
});

// Tests for the tombstone-based sync model in src/js/data/storage.js.
//
// Background: deletions used to remove the night from the array entirely.
// Other clients still had it in localStorage, the merge resurrected it, and
// the push-on-load re-upload was rejected 403 by the server ("new night must
// set hostUserId to your own userId") — permanently breaking sync for every
// non-host until localStorage was cleared. Deletions are now tombstones and
// loads no longer push.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/js/auth/userStore.js', () => ({
  getCurrentUser: () => ({ userId: 'u-me', name: 'Me' })
}));

import { mergeNights, dropZombieNights, tombstoneNight, sanitizeNight } from '../src/js/data/storage.js';

const live = (id, host, lastModified, extra = {}) => ({
  id, hostUserId: host, lastModified, date: '2026-08-07', ...extra,
});

describe('tombstoneNight', () => {
  it('keeps only identity fields plus deleted flag', () => {
    const t = tombstoneNight(live('n1', 'u-host', 5, { rsvps: [{ userId: 'x' }], location: 'here' }));
    expect(t).toMatchObject({ id: 'n1', hostUserId: 'u-host', deleted: true });
    expect(t.location).toBeUndefined();
    expect(t.rsvps).toBeUndefined();
    expect(t.lastModified).toBeGreaterThan(5);
  });
});

describe('sanitizeNight with tombstones', () => {
  it('passes tombstones through without inflating defaults', () => {
    const t = { id: 'n1', hostUserId: 'u-host', deleted: true, lastModified: 99 };
    expect(sanitizeNight(t)).toEqual(t);
  });
});

describe('mergeNights with tombstones', () => {
  it('a newer tombstone beats an older live copy (deletion propagates)', () => {
    const cloud = [{ id: 'n1', hostUserId: 'u-host', deleted: true, lastModified: 2000 }];
    const local = [live('n1', 'u-host', 1000)];
    const merged = mergeNights(cloud, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].deleted).toBe(true);
  });

  it('newer lastModified wins per night', () => {
    const cloud = [live('n1', 'u-host', 1000, { location: 'old' })];
    const local = [live('n1', 'u-host', 2000, { location: 'new' })];
    expect(mergeNights(cloud, local)[0].location).toBe('new');
  });
});

describe('dropZombieNights', () => {
  it('drops local-only nights hosted by someone else (pre-tombstone deletions)', () => {
    const cloud  = [live('n1', 'u-host', 1000)];
    const merged = [live('n1', 'u-host', 1000), live('zombie', 'u-other', 500)];
    const result = dropZombieNights(merged, cloud, 'u-me');
    expect(result.map(n => n.id)).toEqual(['n1']);
  });

  it('keeps local-only nights hosted by the current user (offline creations)', () => {
    const merged = [live('mine', 'u-me', 500)];
    expect(dropZombieNights(merged, [], 'u-me')).toHaveLength(1);
  });

  it('keeps everything that exists in the cloud', () => {
    const cloud  = [live('n1', 'u-other', 1000)];
    const merged = [live('n1', 'u-other', 1000)];
    expect(dropZombieNights(merged, cloud, 'u-me')).toHaveLength(1);
  });
});

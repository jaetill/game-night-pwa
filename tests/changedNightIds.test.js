// Tests for the changed_night_ids log field in GeneratePresignedPost.
//
// Why this test matters: this field exists to answer "the client reported a
// successful save — did it actually change anything?" An empty array on a
// save the user believes did something is the fingerprint of a client-side
// mutation that never reached the payload. If the diff itself is wrong, the
// field points investigations in the wrong direction, which is worse than
// having no field at all.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _changedNightIds: changedNightIds } = require('../lambda/GeneratePresignedPost.js');

const night = (id, extra = {}) => ({ id, hostUserId: 'jaetill', rsvps: [], ...extra });

describe('changedNightIds', () => {
  it('reports nothing when the payload is identical', () => {
    const current = [night('a'), night('b')];
    expect(changedNightIds(current, [night('a'), night('b')])).toEqual([]);
  });

  it('reports a night whose rsvps changed', () => {
    const current = [night('a'), night('b')];
    const accepted = [night('a', { rsvps: [{ userId: 'wil', type: 'playing' }] }), night('b')];
    expect(changedNightIds(current, accepted)).toEqual(['a']);
  });

  it('reports a newly added night', () => {
    expect(changedNightIds([night('a')], [night('a'), night('b')])).toEqual(['b']);
  });

  it('reports a night dropped from the payload entirely', () => {
    expect(changedNightIds([night('a'), night('b')], [night('a')])).toEqual(['b']);
  });

  it('reports every changed night, not just the first', () => {
    const current = [night('a'), night('b'), night('c')];
    const accepted = [
      night('a', { location: 'moved' }),
      night('b'),
      night('c', { time: '19:00' }),
    ];
    expect(changedNightIds(current, accepted).sort()).toEqual(['a', 'c']);
  });

  it('compares ids as strings so numeric ids do not read as changes', () => {
    expect(changedNightIds([{ id: 1 }], [{ id: 1 }])).toEqual([]);
  });

  it('tolerates missing or empty inputs', () => {
    expect(changedNightIds(undefined, undefined)).toEqual([]);
    expect(changedNightIds([], [])).toEqual([]);
    expect(changedNightIds(null, [night('a')])).toEqual(['a']);
  });
});

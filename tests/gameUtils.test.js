import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/js/auth/userStore.js', () => ({
  getCurrentUser: () => ({ userId: 'u-me', name: 'Me' })
}));

import {
  joinGame,
  isGameFull,
  withdrawFromGame,
  withdrawFromAllGames,
  expressInterest,
  withdrawInterest
} from '../src/js/utils/utils.js';

// selectedGames is an OBJECT MAP keyed by gameId — matches the live data shape
// (the legacy array-shaped helpers were removed as dead code).
function makeNight(overrides = {}) {
  return {
    id: 'n1',
    hostUserId: 'u-host',
    rsvps: [{ userId: 'u-me', name: 'Me', type: 'playing' }],
    selectedGames: {
      'game-1': { maxPlayers: 2, signedUpPlayers: [], interestedPlayers: [] },
    },
    lastModified: 1000,
    ...overrides
  };
}

describe('joinGame', () => {
  it('signs the current user up for a game', () => {
    const night = makeNight();
    expect(joinGame(night, 'game-1')).toBe(true);
    expect(night.selectedGames['game-1'].signedUpPlayers).toEqual([
      { userId: 'u-me', name: 'Me' },
    ]);
    expect(night.lastModified).toBeGreaterThan(1000);
  });

  it('refuses when the user has no RSVP', () => {
    const night = makeNight({ rsvps: [] });
    expect(joinGame(night, 'game-1')).toBe(false);
    expect(night.selectedGames['game-1'].signedUpPlayers).toEqual([]);
  });

  it('refuses for a game not on the night', () => {
    expect(joinGame(makeNight(), 'nope')).toBe(false);
  });

  it('does not double-sign-up', () => {
    const night = makeNight();
    joinGame(night, 'game-1');
    expect(joinGame(night, 'game-1')).toBe(false);
    expect(night.selectedGames['game-1'].signedUpPlayers).toHaveLength(1);
  });
});

describe('isGameFull', () => {
  it('is false below maxPlayers and true at maxPlayers', () => {
    const night = makeNight();
    expect(isGameFull(night, 'game-1')).toBe(false);
    night.selectedGames['game-1'].signedUpPlayers = [
      { userId: 'a', name: 'A' }, { userId: 'b', name: 'B' },
    ];
    expect(isGameFull(night, 'game-1')).toBe(true);
  });

  it('is false for unknown games', () => {
    expect(isGameFull(makeNight(), 'nope')).toBe(false);
  });
});

describe('withdrawFromGame / withdrawFromAllGames', () => {
  it('removes the user from a single game', () => {
    const night = makeNight();
    joinGame(night, 'game-1');
    withdrawFromGame(night, 'game-1', { userId: 'u-me' });
    expect(night.selectedGames['game-1'].signedUpPlayers).toEqual([]);
  });

  it('removes the user from every game and interest list', () => {
    const night = makeNight({
      selectedGames: {
        'g1': { maxPlayers: 4, signedUpPlayers: [{ userId: 'u-me', name: 'Me' }], interestedPlayers: [] },
        'g2': { maxPlayers: 4, signedUpPlayers: [{ userId: 'other', name: 'O' }], interestedPlayers: [{ userId: 'u-me', name: 'Me' }] },
      },
    });
    withdrawFromAllGames(night, { userId: 'u-me' });
    expect(night.selectedGames['g1'].signedUpPlayers).toEqual([]);
    expect(night.selectedGames['g2'].signedUpPlayers).toEqual([{ userId: 'other', name: 'O' }]);
    expect(night.selectedGames['g2'].interestedPlayers).toEqual([]);
  });

  it('tolerates a non-object selectedGames', () => {
    expect(() => withdrawFromAllGames({ selectedGames: null }, { userId: 'u-me' })).not.toThrow();
  });
});

describe('expressInterest / withdrawInterest', () => {
  it('adds the current user once', () => {
    const night = makeNight();
    expect(expressInterest(night, 'game-1')).toBe(true);
    expect(expressInterest(night, 'game-1')).toBe(false);
    expect(night.selectedGames['game-1'].interestedPlayers).toEqual([
      { userId: 'u-me', name: 'Me' },
    ]);
  });

  it('withdraws interest for the given user', () => {
    const night = makeNight();
    expressInterest(night, 'game-1');
    withdrawInterest(night, 'game-1', { userId: 'u-me' });
    expect(night.selectedGames['game-1'].interestedPlayers).toEqual([]);
  });
});

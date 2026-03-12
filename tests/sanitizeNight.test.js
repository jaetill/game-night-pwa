import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock getCurrentUser before importing storage so the module picks up the mock
vi.mock('../src/js/auth/userStore.js', () => ({
  getCurrentUser: () => ({ userId: 'test-host', name: 'Test Host' })
}));

import { sanitizeNight } from '../src/js/data/storage.js';

describe('sanitizeNight', () => {
  it('preserves well-formed nights unchanged', () => {
    const night = {
      id: 'n1',
      hostUserId: 'u1',
      rsvps: [{ userId: 'u2', name: 'Bob' }],
      declined: [],
      invited: ['u3'],
      suggestions: [],
      selectedGames: {},
      description: 'Pizza night',
      location: 'Jason\'s place',
      lastModified: 1000
    };
    const result = sanitizeNight(night);
    expect(result.hostUserId).toBe('u1');
    expect(result.description).toBe('Pizza night');
    expect(result.rsvps).toEqual([{ userId: 'u2', name: 'Bob' }]);
    expect(result.lastModified).toBe(1000);
  });

  it('fills in missing fields with defaults', () => {
    const result = sanitizeNight({ id: 'n2', hostUserId: 'u1' });
    expect(result.rsvps).toEqual([]);
    expect(result.declined).toEqual([]);
    expect(result.invited).toEqual([]);
    expect(result.suggestions).toEqual([]);
    expect(result.description).toBe('');
    expect(result.location).toBe('');
  });

  it('converts legacy array selectedGames (string ids) to object format', () => {
    const night = { id: 'n3', hostUserId: 'u1', selectedGames: ['game-abc'] };
    const result = sanitizeNight(night);
    expect(result.selectedGames['game-abc']).toBeDefined();
    expect(result.selectedGames['game-abc'].maxPlayers).toBe(4);
    expect(result.selectedGames['game-abc'].signedUpPlayers).toEqual([]);
  });

  it('converts legacy array selectedGames (object format) to keyed format', () => {
    const night = {
      id: 'n4', hostUserId: 'u1',
      selectedGames: [{ gameId: 'game-xyz', maxPlayers: 6, signedUpPlayers: [] }]
    };
    const result = sanitizeNight(night);
    expect(result.selectedGames['game-xyz']).toBeDefined();
    expect(result.selectedGames['game-xyz'].maxPlayers).toBe(6);
  });

  it('falls back to mocked current user for missing hostUserId', () => {
    const result = sanitizeNight({ id: 'n5' });
    expect(result.hostUserId).toBe('test-host');
  });

  it('adds lastModified if missing', () => {
    const result = sanitizeNight({ id: 'n6', hostUserId: 'u1' });
    expect(typeof result.lastModified).toBe('number');
  });
});

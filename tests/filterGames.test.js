import { describe, it, expect, beforeEach } from 'vitest';
import { setOwnedGames } from '../src/js/data/state.js';
import { filterGames } from '../src/js/data/gameFilters.js';

const library = [
  { id: '1', title: 'Catan',       minPlayers: 3, maxPlayers: 4 },
  { id: '2', title: 'Wingspan',    minPlayers: 1, maxPlayers: 5 },
  { id: '3', title: 'Pandemic',    minPlayers: 2, maxPlayers: 4 },
  { id: '4', title: 'Space Alert', minPlayers: 2, maxPlayers: 5 },
];

beforeEach(() => setOwnedGames([...library]));

describe('filterGames', () => {
  it('returns all games with no filters', () => {
    expect(filterGames({})).toHaveLength(4);
  });

  it('filters by title substring (case-insensitive)', () => {
    const results = filterGames({ searchTerm: 'WING' });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Wingspan');
  });

  it('returns empty array when title matches nothing', () => {
    expect(filterGames({ searchTerm: 'chess' })).toHaveLength(0);
  });

  it('filters by minimum player count (game must support that many)', () => {
    // Games where maxPlayers >= 5: Wingspan, Space Alert
    const results = filterGames({ minPlayers: 5 });
    expect(results.map(g => g.title)).toEqual(
      expect.arrayContaining(['Wingspan', 'Space Alert'])
    );
    expect(results).toHaveLength(2);
  });

  it('filters by maximum player count (game must work for small groups)', () => {
    // Games where minPlayers <= 2: Wingspan, Pandemic, Space Alert
    const results = filterGames({ maxPlayers: 2 });
    expect(results).toHaveLength(3);
    expect(results.find(g => g.title === 'Catan')).toBeUndefined();
  });

  it('combines title and player count filters', () => {
    const results = filterGames({ searchTerm: 'pandemic', minPlayers: 2 });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Pandemic');
  });

  it('handles empty game library', () => {
    setOwnedGames([]);
    expect(filterGames({ searchTerm: 'catan' })).toHaveLength(0);
  });
});

import { ownedGames } from './state.js';

export function filterGames({ minPlayers, maxPlayers, searchTerm }) {
  return ownedGames.filter(game => {
    const matchesPlayers =
      (!minPlayers || game.maxPlayers >= minPlayers) &&
      (!maxPlayers || game.minPlayers <= maxPlayers);
    const matchesTitle =
      !searchTerm || game.title.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesPlayers && matchesTitle;
  });
}

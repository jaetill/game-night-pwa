export function createGameNight({ date, time, snacks }) {
  return {
    id: Date.now().toString(),
    date,
    time,
    snacks,
    rsvps: [],
    suggestions: [],
    selectedGames: [], // now an array of { gameId, maxPlayers, signedUpPlayers }
    lastModified: Date.now()
  };
}

export function addSelectedGame(night, gameId, maxPlayers = 4) {
  if (!night.selectedGames.some(g => g.gameId === gameId)) {
    night.selectedGames.push({
      gameId,
      maxPlayers,
      signedUpPlayers: []
    });
    night.lastModified = Date.now();
  }
}

export function removeSelectedGame(night, gameId) {
  night.selectedGames = night.selectedGames.filter(g => g.gameId !== gameId);
  night.lastModified = Date.now();
}


export function signUpForGame(night, gameId, playerName) {
  const game = night.selectedGames.find(g => g.gameId === gameId);
  if (!game || game.signedUpPlayers.includes(playerName)) return;

  if (game.signedUpPlayers.length < game.maxPlayers) {
    game.signedUpPlayers.push(playerName);
    night.lastModified = Date.now();
  }
}

export function isGameFull(night, gameId) {
  const game = night.selectedGames.find(g => g.gameId === gameId);
  if (!game) return false;
  return game.signedUpPlayers.length >= game.maxPlayers;
}

export function withdrawFromGame(night, gameId, playerName) {
  const game = night.selectedGames.find(g => g.gameId === gameId);
  if (!game) return;

  game.signedUpPlayers = game.signedUpPlayers.filter(p => p !== playerName);
  night.lastModified = Date.now();
}


// Utility functions for game-night player signups. `night.selectedGames` is
// an OBJECT MAP keyed by gameId: { [gameId]: { maxPlayers, title, thumbnail,
// signedUpPlayers[], interestedPlayers[] } }. (Legacy array-shaped helpers —
// createGameNight/addSelectedGame/removeSelectedGame — were dead code written
// against a data shape the app no longer uses, and have been removed. Games
// are added/removed by the host controls in renderGameNightHostControls.js
// and renderSelectedGames.js, which operate on the map directly.)

import { getCurrentUser } from '../auth/userStore.js';

export function joinGame(night, gameId) {
  const user = getCurrentUser();
  if (!user) return false;

  const isRSVPd = night.rsvps?.some(r => r.userId === user.userId);
  if (!isRSVPd) return false;

  const game = night.selectedGames[gameId];
  if (!game) return false;

  const alreadySignedUp = game.signedUpPlayers?.some(p => p.userId === user.userId);
  if (alreadySignedUp) return false;

  game.signedUpPlayers = game.signedUpPlayers || [];
  game.signedUpPlayers.push({ userId: user.userId, name: user.name });
  night.lastModified = Date.now();
  return true;
}

export function withdrawFromAllGames(night, user) {
  if (!night.selectedGames || typeof night.selectedGames !== 'object') return;

  Object.keys(night.selectedGames).forEach(gameId => {
    withdrawFromGame(night, gameId, user);
    withdrawInterest(night, gameId, user);
  });
}

export function isGameFull(night, gameId) {
  const game = night.selectedGames[gameId];
  if (!game) return false;
  return game.signedUpPlayers.length >= game.maxPlayers;
}

export function withdrawFromGame(night, gameId, user) {
  const game = night.selectedGames[gameId];
  if (!game) return;

  game.signedUpPlayers = (game.signedUpPlayers || []).filter(
    p => p.userId !== user.userId
  );
  night.lastModified = Date.now();
}

export function expressInterest(night, gameId) {
  const user = getCurrentUser();
  if (!user) return false;

  const game = night.selectedGames[gameId];
  if (!game) return false;

  game.interestedPlayers = game.interestedPlayers || [];
  if (game.interestedPlayers.some(p => p.userId === user.userId)) return false;

  game.interestedPlayers.push({ userId: user.userId, name: user.name });
  night.lastModified = Date.now();
  return true;
}

export function withdrawInterest(night, gameId, user) {
  const u = user || getCurrentUser();
  if (!u) return;

  const game = night.selectedGames[gameId];
  if (!game) return;

  game.interestedPlayers = (game.interestedPlayers || []).filter(
    p => p.userId !== u.userId
  );
  night.lastModified = Date.now();
}

import { getCurrentUser } from '../auth/userStore.js';


export function createGameNight({ date, time, snacks }) {
  return {
    id: Date.now().toString(),
    date,
    time,
    snacks,
    rsvps: [],
    suggestions: [],
    selectedGames: [], // now an array of { gameId, maxPlayers, signedUpPlayers }
    hostUserId: getCurrentUser().userId,
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

export function joinGame(night, gameId) {
  const user = getCurrentUser();
  if (!user) {
    alert('No user session found.');
    return false;
  }

  const isRSVPd = night.rsvps?.some(r => r.userId === user.userId);
  if (!isRSVPd) {
    alert('Please RSVP before signing up for games.');
    return false;
  }

  const game = night.selectedGames.find(g => g.gameId === gameId);
  if (!game) {
    console.warn('Game not found in this night.');
    return false;
  }

  const alreadySignedUp = game.signedUpPlayers?.some(p => p.userId === user.userId);
  if (alreadySignedUp) return false;

  game.signedUpPlayers = game.signedUpPlayers || [];
  game.signedUpPlayers.push({ userId: user.userId, name: user.name });
  night.lastModified = Date.now();
  return true;
}
// This module provides utility functions for managing game nights and player signups
// It includes functions to create game nights, add/remove games, and manage player signups

export function withdrawFromAllGames(night, user) {
  if (!Array.isArray(night.selectedGames)) return;

  night.selectedGames.forEach(g => {
    withdrawFromGame(night, g.gameId, user);
  });
}


// This module provides utility functions for managing game nights and player signups
// It includes functions to create game nights, add/remove games, and manage player signups


export function isGameFull(night, gameId) {
  const game = night.selectedGames.find(g => g.gameId === gameId);
  if (!game) return false;
  return game.signedUpPlayers.length >= game.maxPlayers;
}

export function withdrawFromGame(night, gameId, user) {
  const game = night.selectedGames.find(g => g.gameId === gameId);
  if (!game) return;

  game.signedUpPlayers = game.signedUpPlayers.filter(
    p => p.userId !== user.userId
  );
  night.lastModified = Date.now();
}



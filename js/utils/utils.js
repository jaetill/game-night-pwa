import { getCurrentUser } from '../auth/auth.js';


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


export function signUpForGame(night, gameId, playerName) {
  const game = night.selectedGames.find(g => g.gameId === gameId);
  if (!game || game.signedUpPlayers.includes(playerName)) return;

  if (game.signedUpPlayers.length < game.maxPlayers) {
    game.signedUpPlayers.push(playerName);
    night.lastModified = Date.now();
  }
}

export function withdrawFromAllGames(night, user) {
  if (!Array.isArray(night.selectedGames)) return;

  night.selectedGames = night.selectedGames.map(g => {
    if (typeof g === 'string') {
      return {
        gameId: g,
        maxPlayers: 4,
        signedUpPlayers: []
      };
    } else if (typeof g === 'object' && Array.isArray(g.signedUpPlayers)) {
      return {
        ...g,
        signedUpPlayers: g.signedUpPlayers.filter(p => p.userId !== user.userId)
      };
    } else {
      return {
        ...g,
        signedUpPlayers: []
      };
    }
  });
}

// This module provides utility functions for managing game nights and player signups
// It includes functions to create game nights, add/remove games, and manage player signups


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


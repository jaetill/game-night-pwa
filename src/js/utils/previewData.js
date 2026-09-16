/**
 * Preview/debug utility — injects fake attendees so the host can see
 * what a busy game night looks like without needing real users.
 * All injected records are tagged with _preview: true for easy cleanup.
 * Only used when DEBUG_MODE is true.
 */

import { newGuest } from '../data/guests.js';

const PREVIEW_PEOPLE = [
  { userId: 'preview_alice',  name: 'Alice Chen',     type: 'playing'    },
  { userId: 'preview_bob',    name: 'Bob Martinez',   type: 'playing'    },
  { userId: 'preview_carol',  name: 'Carol Williams', type: 'any_game'   },
  { userId: 'preview_david',  name: 'David Park',     type: 'spectating' },
  { userId: 'preview_emma',   name: 'Emma Johnson',   type: 'playing'    },
  { userId: 'preview_frank',  name: 'Frank Torres',   type: 'if_needed'  },
  { userId: 'preview_grace',  name: 'Grace Kim',      type: 'spectating' },
  { userId: 'preview_henry',  name: 'Henry Walsh',    type: 'any_game'   },
  { email:  'sarah.preview@example.com', type: null },
  { email:  'mike.preview@example.com',  type: null },
  { userId: 'preview_declined1', name: 'Dee Kline',   type: 'declined'   },
  { userId: 'preview_declined2', name: 'Nope Nelson', type: 'declined'   },
];

export function injectPreviewData(night) {
  night.guests = Array.isArray(night.guests) ? night.guests : [];

  for (const p of PREVIEW_PEOPLE) {
    const present = night.guests.some(g => (p.userId && g.userId === p.userId) || (p.email && g.email === p.email));
    if (present) continue;
    night.guests.push({
      ...newGuest({
        id: `preview-${p.userId || p.email}`,
        userId: p.userId, name: p.name, email: p.email,
        invitedBy: night.hostUserId,
        response: p.type ? { type: p.type } : null,
      }),
      _preview: true,
    });
  }

  // Only 'playing' type people sign up for specific games
  const gameIds = Object.keys(night.selectedGames || {});
  if (gameIds.length > 0) {
    const playingOnly = PREVIEW_PEOPLE.filter(p => p.type === 'playing');

    gameIds.forEach((gameId, gi) => {
      const game = night.selectedGames[gameId];
      game.signedUpPlayers   = game.signedUpPlayers   || [];
      game.interestedPlayers = game.interestedPlayers || [];

      // Sign up playing-type preview players per game (cycling through them)
      const signers = playingOnly.filter((_, i) => i % gameIds.length === gi).slice(0, 3);
      for (const p of signers) {
        if (!game.signedUpPlayers.some(x => x.userId === p.userId)) {
          game.signedUpPlayers.push({ userId: p.userId, name: p.name, _preview: true });
        }
      }
    });
  }

  night.lastModified = Date.now();
}

export function clearPreviewData(night) {
  night.guests = (night.guests || []).filter(g => !g._preview);

  for (const game of Object.values(night.selectedGames || {})) {
    game.signedUpPlayers   = (game.signedUpPlayers   || []).filter(p => !p._preview);
    game.interestedPlayers = (game.interestedPlayers || []).filter(p => !p._preview);
  }

  night.lastModified = Date.now();
}

export function hasPreviewData(night) {
  return (night.guests || []).some(g => g._preview);
}

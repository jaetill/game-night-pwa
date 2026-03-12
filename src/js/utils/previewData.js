/**
 * Preview/debug utility — injects fake attendees so the host can see
 * what a busy game night looks like without needing real users.
 * All injected records are tagged with _preview: true for easy cleanup.
 * Only used when DEBUG_MODE is true.
 */

const PREVIEW_RSVPS = [
  { userId: 'preview_alice',  name: 'Alice Chen',    type: 'playing'    },
  { userId: 'preview_bob',    name: 'Bob Martinez',  type: 'playing'    },
  { userId: 'preview_carol',  name: 'Carol Williams',type: 'flexible'   },
  { userId: 'preview_david',  name: 'David Park',    type: 'spectating' },
  { userId: 'preview_emma',   name: 'Emma Johnson',  type: 'playing'    },
  { userId: 'preview_frank',  name: 'Frank Torres',  type: 'flexible'   },
  { userId: 'preview_grace',  name: 'Grace Kim',     type: 'spectating' },
  { userId: 'preview_henry',  name: 'Henry Walsh',   type: 'playing'    },
];

const PREVIEW_INVITES  = ['sarah.preview@example.com', 'mike.preview@example.com'];
const PREVIEW_DECLINED = ['preview_declined1', 'preview_declined2'];

export function injectPreviewData(night) {
  night.rsvps    = night.rsvps    || [];
  night.invited  = night.invited  || [];
  night.declined = night.declined || [];

  // Add RSVPs not already present
  for (const r of PREVIEW_RSVPS) {
    if (!night.rsvps.some(x => x.userId === r.userId)) {
      night.rsvps.push({ ...r, _preview: true });
    }
  }

  // Add pending email invites
  for (const email of PREVIEW_INVITES) {
    if (!night.invited.includes(email)) night.invited.push(email);
  }

  // Add declined
  for (const uid of PREVIEW_DECLINED) {
    if (!night.declined.includes(uid)) night.declined.push(uid);
  }

  // Distribute preview players across games if any exist
  const gameIds = Object.keys(night.selectedGames || {});
  if (gameIds.length > 0) {
    const playing = PREVIEW_RSVPS.filter(r => r.type === 'playing' || r.type === 'flexible');

    gameIds.forEach((gameId, gi) => {
      const game = night.selectedGames[gameId];
      game.signedUpPlayers  = game.signedUpPlayers  || [];
      game.interestedPlayers = game.interestedPlayers || [];

      // Sign up 2-3 preview players per game (cycling through them)
      const signers = playing.filter((_, i) => i % gameIds.length === gi).slice(0, 3);
      for (const p of signers) {
        if (!game.signedUpPlayers.some(x => x.userId === p.userId)) {
          game.signedUpPlayers.push({ userId: p.userId, name: p.name, _preview: true });
        }
      }

      // Add 1-2 interested players per game
      const interested = playing.filter((_, i) => i % gameIds.length !== gi).slice(0, 2);
      for (const p of interested) {
        if (!game.interestedPlayers.some(x => x.userId === p.userId) &&
            !game.signedUpPlayers.some(x => x.userId === p.userId)) {
          game.interestedPlayers.push({ userId: p.userId, name: p.name, _preview: true });
        }
      }
    });
  }

  night.lastModified = Date.now();
}

export function clearPreviewData(night) {
  night.rsvps    = (night.rsvps    || []).filter(r => !r._preview);
  night.invited  = (night.invited  || []).filter(e => !PREVIEW_INVITES.includes(e));
  night.declined = (night.declined || []).filter(uid => !PREVIEW_DECLINED.includes(uid));

  for (const game of Object.values(night.selectedGames || {})) {
    game.signedUpPlayers   = (game.signedUpPlayers   || []).filter(p => !p._preview);
    game.interestedPlayers = (game.interestedPlayers || []).filter(p => !p._preview);
  }

  night.lastModified = Date.now();
}

export function hasPreviewData(night) {
  return (night.rsvps || []).some(r => r._preview);
}

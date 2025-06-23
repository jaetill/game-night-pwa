import { ownedGames } from '../data/state.js';
import { signUpForGame, withdrawFromGame, isGameFull } from '../utils.js';
import { syncGameNights } from '../storage.js';
import { renderGameNights } from './renderGameNights.js';

export function renderSelectedGames(night, currentUser, nights) {
  const container = document.createElement('div');
  container.className = 'selected-games';

  night.selectedGames.forEach(({ gameId, maxPlayers, signedUpPlayers }) => {
    const game = ownedGames.find(g => g.id === gameId);
    if (!game) return;

    const entry = document.createElement('div');

    const info = document.createElement('p');
    info.textContent = `${game.name} (${signedUpPlayers.length}/${maxPlayers}): ${signedUpPlayers.join(', ') || 'No one yet'}`;
    entry.appendChild(info);

    const img = document.createElement('img');
    img.src = game.thumbnail;
    img.alt = game.name;
    img.className = 'game-thumbnail';
    entry.appendChild(img);

    if (night.rsvps.includes(currentUser)) {
      const isFull = isGameFull(night, gameId);
      const isSignedUp = signedUpPlayers.includes(currentUser);

      const button = document.createElement('button');
      button.textContent = isSignedUp ? 'Leave' : isFull ? 'Full' : 'Join';
      button.disabled = isFull && !isSignedUp;

      button.onclick = () => {
        if (isSignedUp) {
          withdrawFromGame(night, gameId, currentUser);
        } else {
          signUpForGame(night, gameId, currentUser);
        }
        syncGameNights(nights);
        renderGameNights(nights, currentUser);
      };

      entry.appendChild(button);
    }

    container.appendChild(entry);
  });

  return container;
}

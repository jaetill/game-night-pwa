import { ownedGames, saveGameNights } from '../data/index.js';
import { joinGame, withdrawFromGame, isGameFull } from '../utils/index.js';
import { renderGameNights } from './renderGameNights.js';
import { isHost } from '../auth/permissions.js';
import { getDisplayName } from '../utils/userDirectory.js';

export function renderSelectedGames(night, currentUser, nights) {
  const container = document.createElement('div');
  container.className = 'selected-games';

  Object.entries(night.selectedGames).forEach(([gameId, gameData]) => {
    const { maxPlayers, signedUpPlayers } = gameData;
    const game = ownedGames.find(g => g.id === gameId);
    if (!game) return;

    const entry = document.createElement('div');
    entry.className = 'game-entry';

    // Game info line
    const info = document.createElement('p');
    const playerNames = signedUpPlayers.map(p => p.name || getDisplayName(p.userId));
    info.textContent = `${game.title} (${signedUpPlayers.length}/${maxPlayers}): ${playerNames.join(', ') || 'No one yet'}`;

    // Host-only remove button
    if (isHost(currentUser, night)) {
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `Remove ${game.title}`);
      removeBtn.style.marginLeft = '0.5em';
      removeBtn.style.background = 'transparent';
      removeBtn.style.border = 'none';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.color = '#900';
      removeBtn.style.fontWeight = 'bold';

      removeBtn.onclick = async () => {
        delete night.selectedGames[gameId];
        await saveGameNights(nights);
        renderGameNights(nights, currentUser);
      };

      info.appendChild(removeBtn);
    }

    entry.appendChild(info);

    // Thumbnail
    const img = document.createElement('img');
    img.src = game.thumbnail;
    img.alt = game.title;
    img.className = 'game-thumbnail';
    entry.appendChild(img);

    // Join/Leave Button
    const isRSVPd = night.rsvps.some(u => u.userId === currentUser.userId);
    const isSignedUp = signedUpPlayers.some(p => p.userId === currentUser.userId);
    const isFull = isGameFull(night, gameId);

    if (isRSVPd) {
      const button = document.createElement('button');
      button.textContent = isSignedUp ? 'Leave' : isFull ? 'Full' : 'Join';
      button.disabled = isFull && !isSignedUp;

      button.onclick = async () => {
        if (isSignedUp) {
          withdrawFromGame(night, gameId, currentUser);
        } else {
          joinGame(night, gameId);
        }
        await saveGameNights(nights);
        renderGameNights(nights, currentUser);
      };

      entry.appendChild(button);
    }

    container.appendChild(entry);
  });

  return container;
}

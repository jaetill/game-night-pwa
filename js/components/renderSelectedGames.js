import { ownedGames, saveGameNights } from '../data/index.js';
import { joinGame, withdrawFromGame, isGameFull } from '../utils/index.js';
import { renderGameNights } from './renderGameNights.js';
import { isHost } from '../auth/permissions.js';

export function renderSelectedGames(night, currentUser, nights) {
  const container = document.createElement('div');
  container.className = 'selected-games';

  night.selectedGames.forEach(({ gameId, maxPlayers, signedUpPlayers }) => {
    const game = ownedGames.find(g => g.id === gameId);
    if (!game) return;

    const entry = document.createElement('div');

    const info = document.createElement('p');
    const playerNames = signedUpPlayers.map(p => p.name || p.userId);
    info.textContent = `${game.title} (${signedUpPlayers.length}/${maxPlayers}): ${playerNames.join(', ') || 'No one yet'}`;

    // ✅ Host-only inline remove
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
      removeBtn.onclick = () => {
        night.selectedGames = night.selectedGames.filter(g => g.gameId !== gameId);
        (async () => {
          await saveGameNights(nights);
          renderGameNights(nights, currentUser);
        })();
      };

      info.appendChild(removeBtn);
    }

    entry.appendChild(info);

    const img = document.createElement('img');
    img.src = game.thumbnail;
    img.alt = game.title;
    img.className = 'game-thumbnail';
    entry.appendChild(img);

    const isRSVPd = night.rsvps.some(u => u.userId === currentUser.userId);
    const isSignedUp = signedUpPlayers.some(p => p.userId === currentUser.userId);
    const isFull = isGameFull(night, gameId);

    if (isRSVPd) {
      const button = document.createElement('button');
      button.textContent = isSignedUp ? 'Leave' : isFull ? 'Full' : 'Join';
      button.disabled = isFull && !isSignedUp;

      button.onclick = () => {
        if (isSignedUp) {
          withdrawFromGame(night, gameId, currentUser);
        } else {
          joinGame(night, gameId)
        }
        (async () => {
          await saveGameNights(nights);
          renderGameNights(nights, currentUser);
        })();
      };


      entry.appendChild(button);
    }

    container.appendChild(entry);
  });

  return container;
}
// This function renders the selected games for a game night, allowing users to join or leave games,
// and provides admin controls to remove games. It updates the game night list after any changes.
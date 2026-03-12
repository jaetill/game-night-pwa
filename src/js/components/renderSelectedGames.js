import { ownedGames, saveGameNights } from '../data/index.js';
import { joinGame, withdrawFromGame, isGameFull } from '../utils/index.js';
import { renderGameNights } from './renderGameNights.js';
import { isHost } from '../auth/permissions.js';
import { getDisplayName } from '../utils/userDirectory.js';
import { btn } from '../ui/elements.js';
import { toastSuccess, toastError, toastInfo } from '../ui/toast.js';

export function renderSelectedGames(night, currentUser, nights) {
  const container = document.createElement('div');

  const label = document.createElement('span');
  label.className = 'section-label';
  label.textContent = 'Games';
  container.appendChild(label);

  const list = document.createElement('div');
  list.className = 'space-y-3';

  Object.entries(night.selectedGames).forEach(([gameId, gameData]) => {
    const { maxPlayers, signedUpPlayers } = gameData;
    const game = ownedGames.find(g => g.id === gameId);
    if (!game) return;

    const card = document.createElement('div');
    card.className = 'flex items-start gap-3 p-3 bg-gray-50 rounded-xl';

    // Thumbnail
    if (game.thumbnail) {
      const img = document.createElement('img');
      img.src = game.thumbnail;
      img.alt = game.title;
      img.className = 'game-thumb';
      card.appendChild(img);
    }

    // Info
    const info = document.createElement('div');
    info.className = 'flex-1 min-w-0';

    const titleRow = document.createElement('div');
    titleRow.className = 'flex items-center justify-between gap-2';

    const titleEl = document.createElement('p');
    titleEl.className = 'font-medium text-sm text-gray-900 truncate';
    titleEl.textContent = game.title;
    titleRow.appendChild(titleEl);

    if (isHost(currentUser, night)) {
      const removeBtn = btn('Remove', 'danger');
      removeBtn.className += ' text-xs py-0.5 px-2 shrink-0';
      removeBtn.setAttribute('aria-label', `Remove ${game.title}`);
      removeBtn.onclick = async () => {
        removeBtn.disabled = true;
        try {
          delete night.selectedGames[gameId];
          await saveGameNights(nights);
          renderGameNights(nights, currentUser);
          toastInfo(`${game.title} removed.`);
        } catch {
          toastError('Could not remove game.');
          removeBtn.disabled = false;
        }
      };
      titleRow.appendChild(removeBtn);
    }

    info.appendChild(titleRow);

    // Player count progress
    const count = signedUpPlayers.length;
    const playerRow = document.createElement('p');
    playerRow.className = 'text-xs text-gray-500 mt-0.5';
    playerRow.textContent = `${count}/${maxPlayers} players`;
    if (count >= maxPlayers) playerRow.classList.add('text-red-500', 'font-medium');
    info.appendChild(playerRow);

    // Player names
    if (signedUpPlayers.length) {
      const names = document.createElement('p');
      names.className = 'text-xs text-gray-400 mt-0.5 truncate';
      names.textContent = signedUpPlayers
        .map(p => p.name || getDisplayName(p.userId))
        .join(', ');
      info.appendChild(names);
    }

    // Join / Leave button
    const isRSVPd = night.rsvps?.some(u => u.userId === currentUser?.userId);
    if (isRSVPd && currentUser) {
      const isSignedUp = signedUpPlayers.some(p => p.userId === currentUser.userId);
      const isFull = isGameFull(night, gameId);

      let actionBtn;
      if (isSignedUp) {
        actionBtn = btn('Leave', 'ghost');
        actionBtn.className += ' text-xs mt-1';
        actionBtn.onclick = async () => {
          actionBtn.disabled = true;
          try {
            withdrawFromGame(night, gameId, currentUser);
            await saveGameNights(nights);
            renderGameNights(nights, currentUser);
          } catch {
            toastError('Could not update. Try again.');
            actionBtn.disabled = false;
          }
        };
      } else if (!isFull) {
        actionBtn = btn('Join', 'primary');
        actionBtn.className += ' text-xs mt-1';
        actionBtn.onclick = async () => {
          actionBtn.disabled = true;
          try {
            joinGame(night, gameId);
            await saveGameNights(nights);
            renderGameNights(nights, currentUser);
            toastSuccess(`Joined ${game.title}!`);
          } catch {
            toastError('Could not join. Try again.');
            actionBtn.disabled = false;
          }
        };
      } else {
        actionBtn = btn('Full', 'secondary');
        actionBtn.disabled = true;
        actionBtn.className += ' text-xs mt-1 opacity-50';
      }
      info.appendChild(actionBtn);
    }

    card.appendChild(info);
    list.appendChild(card);
  });

  container.appendChild(list);
  return container;
}

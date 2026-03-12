import { ownedGames, saveGameNights } from '../data/index.js';
import { joinGame, withdrawFromGame, isGameFull, expressInterest, withdrawInterest } from '../utils/index.js';
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
    const interestedPlayers = gameData.interestedPlayers || [];
    const count = signedUpPlayers.length;
    const playerRow = document.createElement('p');
    playerRow.className = 'text-xs text-gray-500 mt-0.5';
    playerRow.textContent = `${count}/${maxPlayers} players` +
      (interestedPlayers.length ? ` · ${interestedPlayers.length} interested` : '');
    if (count >= maxPlayers) playerRow.classList.add('text-red-500', 'font-medium');
    info.appendChild(playerRow);

    // Signed-up player names
    if (signedUpPlayers.length) {
      const names = document.createElement('p');
      names.className = 'text-xs text-gray-400 mt-0.5 truncate';
      names.textContent = signedUpPlayers
        .map(p => p.name || getDisplayName(p.userId))
        .join(', ');
      info.appendChild(names);
    }

    // Interested player names
    if (interestedPlayers.length) {
      const interested = document.createElement('p');
      interested.className = 'text-xs text-gray-400 mt-0.5 truncate italic';
      interested.textContent = 'Interested: ' + interestedPlayers
        .map(p => p.name || getDisplayName(p.userId))
        .join(', ');
      info.appendChild(interested);
    }

    // Join / Interested / Leave buttons
    const isRSVPd = night.rsvps?.some(u => u.userId === currentUser?.userId);
    if (isRSVPd && currentUser) {
      const isSignedUp    = signedUpPlayers.some(p => p.userId === currentUser.userId);
      const isInterested  = interestedPlayers.some(p => p.userId === currentUser.userId);
      const isFull        = isGameFull(night, gameId);
      const btnRow        = document.createElement('div');
      btnRow.className    = 'flex gap-1 mt-1';

      if (isSignedUp) {
        const leaveBtn = btn('Leave', 'ghost');
        leaveBtn.className += ' text-xs';
        leaveBtn.onclick = async () => {
          leaveBtn.disabled = true;
          try {
            withdrawFromGame(night, gameId, currentUser);
            await saveGameNights(nights);
            renderGameNights(nights, currentUser);
          } catch {
            toastError('Could not update. Try again.');
            leaveBtn.disabled = false;
          }
        };
        btnRow.appendChild(leaveBtn);
      } else {
        if (!isFull) {
          const joinBtn = btn('Join', 'primary');
          joinBtn.className += ' text-xs';
          joinBtn.onclick = async () => {
            joinBtn.disabled = true;
            try {
              // Also remove interest if they had expressed it
              withdrawInterest(night, gameId, currentUser);
              joinGame(night, gameId);
              await saveGameNights(nights);
              renderGameNights(nights, currentUser);
              toastSuccess(`Joined ${game.title}!`);
            } catch {
              toastError('Could not join. Try again.');
              joinBtn.disabled = false;
            }
          };
          btnRow.appendChild(joinBtn);
        } else {
          const fullBtn = btn('Full', 'secondary');
          fullBtn.disabled = true;
          fullBtn.className += ' text-xs opacity-50';
          btnRow.appendChild(fullBtn);
        }

        if (isInterested) {
          const unintBtn = btn('Interested ✓', 'secondary');
          unintBtn.className += ' text-xs';
          unintBtn.onclick = async () => {
            unintBtn.disabled = true;
            try {
              withdrawInterest(night, gameId, currentUser);
              await saveGameNights(nights);
              renderGameNights(nights, currentUser);
            } catch {
              toastError('Could not update. Try again.');
              unintBtn.disabled = false;
            }
          };
          btnRow.appendChild(unintBtn);
        } else {
          const intBtn = btn('Interested', 'ghost');
          intBtn.className += ' text-xs';
          intBtn.onclick = async () => {
            intBtn.disabled = true;
            try {
              expressInterest(night, gameId);
              await saveGameNights(nights);
              renderGameNights(nights, currentUser);
            } catch {
              toastError('Could not update. Try again.');
              intBtn.disabled = false;
            }
          };
          btnRow.appendChild(intBtn);
        }
      }

      info.appendChild(btnRow);
    }

    card.appendChild(info);
    list.appendChild(card);
  });

  container.appendChild(list);
  return container;
}

import { ownedGames, saveGameNights } from '../data/index.js';
import { joinGame, withdrawFromGame, isGameFull } from '../utils/index.js';
import { renderGameNights } from './renderGameNights.js';
import { isHost } from '../auth/permissions.js';
import { getDisplayName } from '../utils/userDirectory.js';
import { btn } from '../ui/elements.js';
import { toastSuccess, toastError, toastInfo } from '../ui/toast.js';

// Deterministic hue from a string so the same person always gets the same color
function nameHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return h % 360;
}

function initialsCircle(name) {
  const parts    = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : name.slice(0, 2);
  const hue = nameHue(name);

  const wrapper = document.createElement('div');
  wrapper.className = 'relative group shrink-0';

  const el = document.createElement('div');
  el.className = 'flex items-center justify-center rounded-full text-white font-semibold cursor-default';
  el.style.cssText = `width:1.75rem;height:1.75rem;font-size:0.6rem;background:hsl(${hue},55%,52%)`;
  el.textContent = initials.toUpperCase();

  const tooltip = document.createElement('div');
  tooltip.className = 'absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity duration-150';
  tooltip.textContent = name;

  wrapper.appendChild(el);
  wrapper.appendChild(tooltip);
  return wrapper;
}

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

    // Signed-up players — initials circles
    if (signedUpPlayers.length) {
      const avatarRow = document.createElement('div');
      avatarRow.className = 'flex flex-wrap gap-1 mt-1.5';
      signedUpPlayers.forEach(p => {
        avatarRow.appendChild(initialsCircle(p.name || getDisplayName(p.userId)));
      });
      info.appendChild(avatarRow);
    }

    // Interested players — name chips
    if (interestedPlayers.length) {
      const chipRow = document.createElement('div');
      chipRow.className = 'flex flex-wrap gap-1 mt-1';
      const label = document.createElement('span');
      label.className = 'text-xs text-gray-400 italic self-center';
      label.textContent = 'Interested:';
      chipRow.appendChild(label);
      interestedPlayers.forEach(p => {
        const chip = document.createElement('span');
        chip.className = 'text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full italic';
        chip.textContent = p.name || getDisplayName(p.userId);
        chipRow.appendChild(chip);
      });
      info.appendChild(chipRow);
    }

    // ── Guest join/leave (playing type only) ─────────────────
    const currentRSVP = night.rsvps?.find(r => r.userId === currentUser?.userId);
    if (currentRSVP && currentUser) {
      const isSignedUp = signedUpPlayers.some(p => p.userId === currentUser.userId);
      const isFull     = isGameFull(night, gameId);
      const btnRow     = document.createElement('div');
      btnRow.className = 'flex gap-1 mt-1';

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
      } else if (currentRSVP.type === 'playing' && !isFull) {
        const joinBtn = btn('Join', 'primary');
        joinBtn.className += ' text-xs';
        joinBtn.onclick = async () => {
          joinBtn.disabled = true;
          try {
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
      } else if (currentRSVP.type === 'playing' && isFull) {
        const fullBtn = btn('Full', 'secondary');
        fullBtn.disabled = true;
        fullBtn.className += ' text-xs opacity-50';
        btnRow.appendChild(fullBtn);
      }

      if (btnRow.children.length) info.appendChild(btnRow);
    }

    // ── Host assignment (any_game / if_needed people) ─────────
    if (isHost(currentUser, night)) {
      // Build assignable list: any_game/if_needed RSVPs + their guests
      const assignableRsvps = (night.rsvps || []).filter(r =>
        (r.type === 'any_game' || r.type === 'if_needed') &&
        !signedUpPlayers.some(p => p.userId === r.userId) &&
        !isGameFull(night, gameId)
      );

      const assignableGuests = (night.rsvps || []).flatMap(r => {
        const sponsorName = r.name || getDisplayName(r.userId);
        return Array.from({ length: r.guests || 0 }, (_, i) => ({
          userId: `${r.userId}_guest_${i + 1}`,
          name:   `${sponsorName}'s Guest #${i + 1}`,
          _guest: true,
        }));
      }).filter(g => !signedUpPlayers.some(p => p.userId === g.userId) && !isGameFull(night, gameId));

      const assignable = [...assignableRsvps, ...assignableGuests];

      if (assignable.length > 0) {
        const assignRow = document.createElement('div');
        assignRow.className = 'flex gap-2 mt-2 items-center';

        const select = document.createElement('select');
        select.className = 'field text-xs flex-1 py-1';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Assign a player…';
        select.appendChild(placeholder);
        assignable.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.userId;
          opt.textContent = r._guest
            ? r.name
            : `${r.name || getDisplayName(r.userId)} (${r.type === 'any_game' ? 'put me in a game' : 'if needed'})`;
          select.appendChild(opt);
        });

        const assignBtn = btn('Assign', 'secondary');
        assignBtn.className += ' text-xs';
        assignBtn.onclick = async () => {
          if (!select.value) return;
          const entry = assignable.find(r => r.userId === select.value);
          if (!entry) return;
          assignBtn.disabled = true;
          try {
            night.selectedGames[gameId].signedUpPlayers.push({ userId: entry.userId, name: entry.name });
            night.lastModified = Date.now();
            await saveGameNights(nights);
            renderGameNights(nights, currentUser);
            toastSuccess(`${entry.name} assigned to ${game.title}!`);
          } catch {
            toastError('Could not assign. Try again.');
            assignBtn.disabled = false;
          }
        };

        assignRow.appendChild(select);
        assignRow.appendChild(assignBtn);
        info.appendChild(assignRow);
      }
    }

    card.appendChild(info);
    list.appendChild(card);
  });

  container.appendChild(list);
  return container;
}

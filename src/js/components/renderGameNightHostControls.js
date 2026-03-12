import { openGameSelectionModal } from './gameSelectionModal.js';
import { syncAndRender } from '../utils/index.js';
import { saveGameNights } from '../data/index.js';
import { renderGameNightForm } from './renderGameNightForm.js';
import { getCurrentUser } from '../auth/userStore.js';
import { renderGameNights } from './renderGameNights.js';
import { btn, input } from '../ui/elements.js';
import { toastSuccess, toastError, toastInfo } from '../ui/toast.js';

export function renderHostGameControls(night, nights) {
  const container = document.createElement('div');
  container.className = 'space-y-3';

  // ── Add game ─────────────────────────────────────────────
  const addGameBtn = btn('＋ Add game', 'secondary');
  addGameBtn.onclick = () => {
    openGameSelectionModal({
      night,
      onSelect: game => {
        night.selectedGames = night.selectedGames || {};
        if (!night.selectedGames[game.id]) {
          night.selectedGames[game.id] = {
            maxPlayers: game.defaultMaxPlayers || 4,
            signedUpPlayers: []
          };
          toastSuccess(`${game.title} added!`);
        }
        syncAndRender(nights);
      }
    });
  };
  container.appendChild(addGameBtn);

  // ── Invite by email ──────────────────────────────────────
  const inviteRow = document.createElement('div');
  inviteRow.className = 'flex gap-2 items-center';

  const inviteInput = input('Invite by email…');
  inviteInput.type = 'email';
  inviteInput.className = 'field flex-1 text-sm';

  const inviteBtn = btn('Invite', 'secondary');
  inviteBtn.onclick = () => {
    const email = inviteInput.value.trim().toLowerCase();
    if (!email) return;
    if (!email.includes('@')) {
      toastError('Please enter a valid email address.');
      return;
    }

    night.invited = night.invited || [];
    const already = night.rsvps?.some(r => r.userId === email) ||
                    night.invited.includes(email);
    if (!already) {
      night.invited.push(email);
      night.lastModified = Date.now();
      inviteInput.value = '';
      syncAndRender(nights);
      toastSuccess(`${email} invited!`);
    } else {
      toastInfo(`${email} is already invited.`);
      inviteInput.value = '';
    }
  };

  inviteInput.addEventListener('keydown', e => { if (e.key === 'Enter') inviteBtn.click(); });

  inviteRow.appendChild(inviteInput);
  inviteRow.appendChild(inviteBtn);
  container.appendChild(inviteRow);

  return container;
}

export function renderHostActions(night, nights) {
  const container = document.createElement('div');
  container.className = 'flex gap-2 pt-2';

  const editBtn = btn('Edit event', 'secondary');
  editBtn.onclick = () => {
    renderGameNightForm({
      night,
      onSave: async updated => {
        const idx = nights.findIndex(n => n.id === updated.id);
        if (idx !== -1) nights[idx] = updated;
        await saveGameNights(nights);
        renderGameNights(nights, getCurrentUser());
        toastSuccess('Event updated!');
      }
    });
  };

  const cancelBtn = btn('Cancel event', 'danger');
  cancelBtn.onclick = async () => {
    if (!confirm('Cancel this game night? This cannot be undone.')) return;
    cancelBtn.disabled = true;
    try {
      const updated = nights.filter(n => n.id !== night.id);
      syncAndRender(updated);
      await saveGameNights(updated);
      toastInfo('Event cancelled.');
    } catch (err) {
      toastError('Could not cancel event.');
      cancelBtn.disabled = false;
    }
  };

  container.appendChild(editBtn);
  container.appendChild(cancelBtn);
  return container;
}

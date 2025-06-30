import { openGameSelectionModal } from './gameSelectionModal.js';
import { syncAndRender } from '../utils/index.js';
import { saveGameNights } from '../data/index.js';
import { renderGameNightForm } from './renderGameNightForm.js';
import { getCurrentUser } from '../auth/userStore.js';
import { renderGameNights } from './renderGameNights.js';

/**
 * Renders admin controls for adding games to a game night.
 * Removes any separate UI for removing games (now handled inline).
 */
export function renderHostGameControls(night, nights) {
  const container = document.createElement('div');
  container.style.marginTop = '0.5em';

  // --- Add Game Button (already exists) ---
  const addGameBtn = document.createElement('button');
  addGameBtn.textContent = 'Add Game';
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
        }
        syncAndRender(nights);
      }
    });
  };
  container.appendChild(addGameBtn);

  // --- Invite User UI ---
  const inviteLabel = document.createElement('label');
  inviteLabel.textContent = 'Invite user by ID: ';
  inviteLabel.style.marginLeft = '1em';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'e.g. eli456';
  input.style.marginRight = '0.5em';

  const inviteBtn = document.createElement('button');
  inviteBtn.textContent = '+';
  inviteBtn.onclick = () => {
    const userId = input.value.trim();
    if (!userId) return;

    night.invited = night.invited || [];
    const alreadyThere =
      night.rsvps.some(r => r.userId === userId) ||
      night.invited.includes(userId);

    if (!alreadyThere) {
      night.invited.push(userId);
      night.lastModified = Date.now();
      syncAndRender(nights);
    }

    input.value = ''; // reset after invite
  };

  inviteLabel.appendChild(input);
  inviteLabel.appendChild(inviteBtn);
  container.appendChild(document.createElement('br'));
  container.appendChild(inviteLabel);

  return container;
}

/**
 * Renders admin-level actions for a given game night,
 * including editing or canceling the event.
 */
export function renderHostActions(night, nights) {
  const container = document.createElement('div');

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.onclick = () => {
    renderGameNightForm({
      night,
      onSave: async updated => {
        const idx = nights.findIndex(n => n.id === updated.id);
        if (idx !== -1) nights[idx] = updated;
        await saveGameNights(nights);
        renderGameNights(nights, getCurrentUser());
      }
    });
  };



  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel Event';
  cancelBtn.onclick = async () => {
  const updated = nights.filter(n => n.id !== night.id);
  try {
    syncAndRender(updated);
    await saveGameNights(updated);
  } catch (err) {
    console.error('❌ Failed to cancel event:', err);
  }
};


  container.appendChild(document.createElement('br'));
  container.appendChild(editBtn);
  container.appendChild(cancelBtn);
  return container;
}

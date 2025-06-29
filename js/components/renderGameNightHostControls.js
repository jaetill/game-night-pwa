import { openGameSelectionModal } from './gameSelectionModal.js';
import { syncAndRender } from '../utils/index.js';
import { saveGameNights } from '../data/index.js';

/**
 * Renders admin controls for adding games to a game night.
 * Removes any separate UI for removing games (now handled inline).
 */
export function renderHostGameControls(night, nights) {
  const container = document.createElement('div');
  container.style.marginTop = '0.5em';

  const addGameBtn = document.createElement('button');
  addGameBtn.textContent = 'Add Game';
  addGameBtn.onclick = () => {
    openGameSelectionModal({
      night,
      onSelect: game => {
        night.selectedGames = night.selectedGames || [];
        const alreadySelected = night.selectedGames.some(g => g.gameId === game.id);
        if (!alreadySelected) {
          night.selectedGames.push({
            gameId: game.id,
            maxPlayers: game.defaultMaxPlayers || 4,
            signedUpPlayers: []
          });
        }
        syncAndRender(nights);
      }
    });
  };

  container.appendChild(addGameBtn);
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

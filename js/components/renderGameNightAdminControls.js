import { ownedGames } from '../data/index.js';
import { openGameSelectionModal } from './gameSelectionModal.js';
import { syncAndRender } from '../utils/index.js';
import { getCurrentUser } from '../auth/auth.js';

/**
 * Renders the admin game controls section for a given game night.
 * Allows adding or removing selected games.
 */
export function renderAdminGameControls(night, nights) {
  const container = document.createElement('div');
  container.style.marginTop = '0.5em';
  container.innerHTML = `<strong>🎯 Games:</strong>`;

  const list = document.createElement('ul');
  list.style.margin = '0.5em 0';
  list.style.paddingLeft = '1.2em';

  function updateGameSelectionUI() {
    list.innerHTML = '';
    (night.selectedGames || []).forEach(gameObj => {
      const game = ownedGames.find(g => g.id === gameObj.gameId);
      if (!game) return;

      const li = document.createElement('li');
      li.textContent = game.title;

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove';
      removeBtn.style.marginLeft = '0.5em';
      removeBtn.onclick = () => {
        night.selectedGames = night.selectedGames.filter(g => g.gameId !== game.id);
        syncAndRender(nights);
      };

      li.appendChild(removeBtn);
      list.appendChild(li);
    });
  }

  updateGameSelectionUI();

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

  container.appendChild(list);
  container.appendChild(addGameBtn);
  return container;
}

/**
 * Renders admin-level actions for a given game night,
 * including editing or canceling the event.
 */
export function renderAdminActions(night, nights) {
  const container = document.createElement('div');

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.onclick = () => {
    document.getElementById('gameDate').value = night.date;
    document.getElementById('gameTime').value = night.time;
    localStorage.setItem('editingNightId', night.id);
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel Event';
  cancelBtn.onclick = () => {
    const updated = nights.filter(n => n.id !== night.id);
    syncAndRender(updated).catch(console.error);
  };

  container.appendChild(document.createElement('br'));
  container.appendChild(editBtn);
  container.appendChild(cancelBtn);
  return container;
}

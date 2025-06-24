import { ownedGames } from '../data/index.js';
import { openGameSelectionModal } from './gameSelectionModal.js';

export function renderAdminGameControls(night) {
  const container = document.createElement('div');
  container.style.marginTop = '0.5em';
  container.innerHTML = `<strong>🎯 Games:</strong>`;

  const list = document.createElement('ul');
  list.style.margin = '0.5em 0';
  list.style.paddingLeft = '1.2em';

  function updateGameSelectionUI() {
    list.innerHTML = '';
    (night.selectedGames || []).forEach(gameId => {
      const game = ownedGames.find(g => g.id === gameId);
      if (!game) return;
      const li = document.createElement('li');
      li.textContent = game.title;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove';
      removeBtn.style.marginLeft = '0.5em';
      removeBtn.onclick = () => {
        night.selectedGames = night.selectedGames.filter(id => id !== game.id);
        updateGameSelectionUI();
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
        if (!night.selectedGames.includes(game.id)) {
          night.selectedGames.push(game.id);
        }
        updateGameSelectionUI();
      }
    });
  };

  container.appendChild(list);
  container.appendChild(addGameBtn);
  return container;
}


import { syncAndRender } from '../utils/index.js';

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
// This file contains functions to render admin controls for game nights
// It includes rendering game selection controls and admin actions like edit and cancel 
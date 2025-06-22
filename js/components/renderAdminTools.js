import { syncAndRender } from '../utils/index.js';
import { openGameSelectionModal } from '../components/gameSelectionModal.js';
import { ownedGames } from '../data/state.js';

export function renderAdminTools(night, nights) {
  const wrapper = document.createElement('div');

  // 🎯 Game Display + Add Button
  const gameBlock = document.createElement('div');
  gameBlock.style.marginTop = '0.5em';
  gameBlock.innerHTML = `<strong>🎯 Games:</strong>`;

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

  gameBlock.appendChild(list);
  gameBlock.appendChild(addGameBtn);
  wrapper.appendChild(gameBlock);

  // 📝 Edit Button
  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.onclick = () => {
    document.getElementById('gameDate').value = night.date;
    document.getElementById('gameTime').value = night.time;
    localStorage.setItem('editingNightId', night.id);
  };

  // ❌ Cancel Button
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel Event';
  cancelBtn.onclick = () => {
    const updated = nights.filter(n => n.id !== night.id);
    //syncAndRender(updated);
    syncAndRender().catch(console.error);
  };

  wrapper.appendChild(document.createElement('br'));
  wrapper.appendChild(editBtn);
  wrapper.appendChild(cancelBtn);

  return wrapper;
}
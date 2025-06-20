import {
  createGameNight,
  syncAndRender
} from '../utils/index.js';

export function renderAdminTools(night, nights, ownedGames) {
  const wrapper = document.createElement('div');

  // 🎯 Game Selection Dropdown
  const gameSelect = document.createElement('select');
  gameSelect.multiple = true;
  gameSelect.size = 4;
  gameSelect.style.marginTop = '0.5em';

  ownedGames.forEach(game => {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = game.title;
    if (night.selectedGames?.includes(game.id)) {
      option.selected = true;
    }
    gameSelect.appendChild(option);
  });

  gameSelect.addEventListener('change', () => {
    night.selectedGames = [...gameSelect.selectedOptions].map(opt => opt.value);
    syncAndRender(nights);
  });

  wrapper.appendChild(document.createElement('br'));
  wrapper.appendChild(document.createTextNode("🎯 Select games to play:"));
  wrapper.appendChild(gameSelect);

  // 📝 Edit Button
  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.onclick = () => {
    document.getElementById('gameDate').value = night.date;
    document.getElementById('gameTime').value = night.time;
    //const filtered = nights.filter(n => n.id !== night.id);
    //syncAndRender(filtered);
	  // Optional: store the ID of the night being edited
	localStorage.setItem('editingNightId', night.id);

  // Don’t remove anything yet—wait for form submission to update
  };

  // ❌ Cancel Button
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel Event';
  cancelBtn.onclick = () => {
    const updated = nights.filter(n => n.id !== night.id);
    syncAndRender(updated);
  };

  wrapper.appendChild(document.createElement('br'));
  wrapper.appendChild(editBtn);
  wrapper.appendChild(cancelBtn);

  return wrapper;
}

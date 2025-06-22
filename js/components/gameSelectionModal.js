import { filterGames } from '../data/index.js';
import { syncAndRender } from '../utils/index.js';

export function openGameSelectionModal({ night }) {
  const modal = document.getElementById('gameModal');
  const searchInput = document.getElementById('gameSearch');
  const playerInput = document.getElementById('gamePlayerCount');
  const gameSelectionList = document.getElementById('gameSelectionList');
  const closeBtn = document.getElementById('closeModal');

  if (!modal) {
    console.error('Modal element not found in DOM');
    return;
  }

  modal.classList.remove('hidden');

  closeBtn.onclick = () => {
    modal.classList.add('hidden');
    clearInputs();
  };

  function clearInputs() {
    searchInput.value = '';
    playerInput.value = 4;
    gameSelectionList.innerHTML = '';
  }

  function renderFilteredGames() {
    const query = searchInput.value.trim();
    const count = Number(playerInput.value || 1);

    const matches = filterGames({
      searchTerm: query,
      minPlayers: count,
      maxPlayers: count
    });

    gameSelectionList.innerHTML = '';

    if (matches.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'no-results';
      emptyMsg.textContent = 'No matching games found.';
      gameSelectionList.appendChild(emptyMsg);
      return;
    }

    matches.forEach(game => {
      const li = document.createElement('li');
      li.className = 'game-option';
      li.textContent = `${game.title} (${game.minPlayers}–${game.maxPlayers})`;

      li.onclick = async () => {
        modal.classList.add('hidden');
        clearInputs();

        const nights = await loadGameNights();
        const index = nights.findIndex(n => n.id === night.id);

        if (index !== -1) {
          const selected = nights[index].selectedGames ?? [];
          if (!selected.includes(game.id)) {
            selected.push(game.id);
          }
          nights[index].selectedGames = selected;
          syncAndRender(nights);
        } else {
          console.warn("Could not find matching night to update.");
        }
      };



      gameSelectionList.appendChild(li);
    });

    console.log("Rendered", matches.length, "games into", gameSelectionList);
  }

  searchInput.oninput = renderFilteredGames;
  playerInput.oninput = renderFilteredGames;

  renderFilteredGames();
}

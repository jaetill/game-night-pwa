import { filterGames, ownedGames } from '../data/index.js';

export function openGameSelectionModal({ night, onSelect }) {
  const modal = document.getElementById('gameModal');
  const searchInput = document.getElementById('gameSearch');
  const playerInput = document.getElementById('gamePlayerCount');
  const gameList = document.getElementById('gameList');
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
    gameList.innerHTML = '';
  }

  function renderFilteredGames() {
    const query = searchInput.value.trim();
    const count = Number(playerInput.value || 1);

    const matches = filterGames({ searchTerm: query, minPlayers: count });

    gameList.innerHTML = '';

    matches.forEach(game => {
      const entry = document.createElement('div');
      entry.className = 'game-option';
      entry.textContent = `${game.title} (${game.minPlayers}–${game.maxPlayers})`;
      entry.onclick = () => {
        modal.classList.add('hidden');
        clearInputs();

        if (typeof onSelect === 'function') {
          onSelect(game);
        }
      };
      gameList.appendChild(entry);
    });
  }

  searchInput.oninput = renderFilteredGames;
  playerInput.oninput = renderFilteredGames;

  renderFilteredGames();
}

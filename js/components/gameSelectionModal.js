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

  console.log("Owned games at modal open:", ownedGames);

  const matches = filterGames({
    searchTerm: query,
    playerCount: count // assuming your filter takes `playerCount` now
  });

  console.log("Filter returned:", matches);

  gameList.innerHTML = '';

  if (matches.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'no-results';
    emptyMsg.textContent = 'No matching games found.';
    gameList.appendChild(emptyMsg);
    console.log("Rendered 0 games into", gameList);
    return;
  }

  matches.forEach(game => {
    const li = document.createElement('li');
    li.className = 'game-option';
    li.textContent = `${game.title} (${game.minPlayers}–${game.maxPlayers})`;
    li.onclick = () => {
      modal.classList.add('hidden');
      clearInputs();
      if (typeof onSelect === 'function') {
        onSelect(game);
      }
    };
    gameList.appendChild(li);
  });

  console.log("Rendered", matches.length, "games into", gameList);
}

  searchInput.oninput = renderFilteredGames;
  playerInput.oninput = renderFilteredGames;

  renderFilteredGames();
}

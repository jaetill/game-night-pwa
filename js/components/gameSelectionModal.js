import { filterGames, loadGameNights } from '../data/index.js';
import { syncAndRender } from '../utils/index.js';

/**
 * Opens the game selection modal for choosing games to add to a game night.
 * Accepts a night object and optional onSelect callback.
 */
export function openGameSelectionModal({ night, onSelect }) {
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

        if (onSelect) {
          onSelect(game);
          return;
        }

        // Fallback if no external handler is provided
        const nights = await loadGameNights();
        const index = nights.findIndex(n => n.id === night.id);

        if (index !== -1) {
          const selected = nights[index].selectedGames ?? [];
          const alreadySelected = selected.some(g => g.gameId === game.id);

          if (!alreadySelected) {
            selected.push({
              gameId: game.id,
              maxPlayers: game.defaultMaxPlayers || 4,
              signedUpPlayers: []
            });
          }

          nights[index].selectedGames = selected;
          nights[index].lastModified = Date.now();
          syncAndRender(nights);
        } else {
          console.warn('Could not find matching night to update.');
        }
      };

      gameSelectionList.appendChild(li);
    });

    console.log(`Rendered ${matches.length} games into the selection list.`);
  }

  searchInput.oninput = renderFilteredGames;
  playerInput.oninput = renderFilteredGames;

  renderFilteredGames();
}

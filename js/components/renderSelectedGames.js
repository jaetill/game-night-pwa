export function renderSelectedGames(night, ownedGames) {
  const container = document.createElement('div');
  container.className = 'selected-games';

  if (!night || !Array.isArray(ownedGames)) {
    console.warn("Invalid night or ownedGames data");
    return container;
  }

  const selectedGames = night.selectedGames || [];
  if (!selectedGames.length) return container;

  const titles = [];
  const thumbContainer = document.createElement('div');
  thumbContainer.className = 'thumbnail-list';

  selectedGames.forEach(id => {
    const selectedGame = ownedGames.find(g => g.id === id);
    if (selectedGame) {
      titles.push(selectedGame.title || `#${id}`);

      if (selectedGame.thumbnail) {
        const img = document.createElement('img');
        img.src = selectedGame.thumbnail;
        img.alt = selectedGame.title || 'Game';
        img.className = 'game-thumbnail';
        thumbContainer.appendChild(img);
      }
    }
  });

  const titleList = document.createElement('p');
  titleList.textContent = `🎯 Playing: ${titles.join(', ')}`;

  container.appendChild(titleList);
  if (thumbContainer.children.length) {
    container.appendChild(thumbContainer);
  }

  return container;
}

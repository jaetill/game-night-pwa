export function renderSelectedGames(night, ownedGames) {
  if (!night.selectedGames?.length || !ownedGames.length) return document.createElement('div');

  const titles = night.selectedGames.map(id => {
    const selectedGame = ownedGames.find(g => g.id === id);
    console.log("Resolved game:", selectedGame);
    return selectedGame?.title || `#${id}`;
  });

  const gameSelectedList = document.createElement('p');
  gameSelectedList.textContent = `🎯 Playing: ${titles.join(', ')}`;
  return gameSelectedList;
}

export function renderSelectedGames(night, ownedGames) {
  //console.log("renderSelectedGames called with:", night, ownedGames);
  if (!night || !ownedGames || !Array.isArray(ownedGames)) {
    console.warn("Invalid night or ownedGames data");
    return document.createElement('div');
  }
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

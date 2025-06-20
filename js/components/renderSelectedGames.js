export function renderSelectedGames(night, ownedGames) {
  if (!night.selectedGames?.length || !ownedGames.length) return document.createElement('div');

  const titles = night.selectedGames.map(id => {
    const match = ownedGames.find(g => g.id === id);
    return match?.title || `#${id}`;
  });

  const gameList = document.createElement('p');
  gameList.textContent = `🎯 Playing: ${titles.join(', ')}`;
  return gameList;
}

// Core imports
import { ownedGames, syncGameNights } from '../data/index.js';
import { signUpForGame, withdrawFromGame, isGameFull } from '../utils/index.js';

export function renderGameNights(nights, currentUser) {
  const container = document.getElementById('game-nights');
  container.innerHTML = '';

  nights.forEach(night => {
    const card = document.createElement('div');
    card.className = 'game-night-card';

    const header = document.createElement('h3');
    header.textContent = `${night.date} @ ${night.time}`;
    card.appendChild(header);

    const snacks = document.createElement('p');
    snacks.textContent = `Snacks: ${night.snacks}`;
    card.appendChild(snacks);

    const rsvp = document.createElement('p');
    rsvp.textContent = `RSVPs: ${night.rsvps.join(', ') || 'None yet'}`;
    card.appendChild(rsvp);

    const gameSection = document.createElement('div');
    gameSection.className = 'selected-games';

night.selectedGames.forEach(({ gameId, maxPlayers, signedUpPlayers }) => {
  const game = ownedGames.find(g => g.id === gameId);
  if (!game) return;

  const entry = document.createElement('div');

  const info = document.createElement('p');
  info.textContent = `${game.name} (${signedUpPlayers.length}/${maxPlayers}): ${signedUpPlayers.join(', ') || 'No one yet'}`;
  entry.appendChild(info);

  const img = document.createElement('img');
  img.src = game.thumbnail;
  img.alt = game.name;
  img.className = 'game-thumbnail';
  entry.appendChild(img);

  if (night.rsvps.includes(currentUser)) {
    const isFull = isGameFull(night, gameId);
    const isSignedUp = signedUpPlayers.includes(currentUser);

    const button = document.createElement('button');
    button.textContent = isSignedUp ? 'Leave' : isFull ? 'Full' : 'Join';
    button.disabled = isFull && !isSignedUp;

    button.onclick = () => {
      if (isSignedUp) {
        withdrawFromGame(night, gameId, currentUser);
      } else {
        signUpForGame(night, gameId, currentUser);
      }
      syncGameNights(nights);
      renderGameNights(nights, currentUser);
    };

    entry.appendChild(button);
  }

  gameSection.appendChild(entry);
});


    card.appendChild(gameSection);
    container.appendChild(card);
  });
}

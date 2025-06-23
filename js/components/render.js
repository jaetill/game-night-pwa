import { signUpForGame, withdrawFromGame, isGameFull } from '../utils/index.js';
import { ownedGames, syncGameNights } from '../data/index.js';

export function renderGameNights(nights, currentUser) {
  const container = document.getElementById('gameNightList');
  container.innerHTML = '';

  nights.forEach(night => {
    const li = document.createElement('li');
    li.className = 'game-card';

    const header = document.createElement('h3');
    header.textContent = `${night.date} @ ${night.time}`;
    li.appendChild(header);

    const snacks = document.createElement('p');
    snacks.textContent = `Snacks: ${night.snacks || 'None'}`;
    li.appendChild(snacks);

    const rsvp = document.createElement('p');
    rsvp.textContent = `RSVPs: ${night.rsvps.join(', ') || 'None yet'}`;
    li.appendChild(rsvp);

    if (night.selectedGames.length > 0) {
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

      li.appendChild(gameSection);
    }

    container.appendChild(li);
  });
}

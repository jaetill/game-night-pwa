import { signUpForGame, withdrawFromGame, isGameFull } from '../utils/index.js';
import { ownedGames, syncGameNights } from '../data/index.js';
import { renderSelectedGames } from './renderSelectedGames.js'; 

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
      const selectedGamesUI = renderSelectedGames(night, currentUser, nights);
      li.appendChild(selectedGamesUI);
    }
 }); 
}

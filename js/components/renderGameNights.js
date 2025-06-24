import { renderSelectedGames } from './renderSelectedGames.js';
import { renderRSVP } from './renderRSVP.js';
import { renderSuggestions } from './renderSuggestions.js';


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

    const rsvpUI = renderRSVP(night, nights);
    li.appendChild(rsvpUI);

    const suggestionsUI = renderSuggestions(night, nights);
    li.appendChild(suggestionsUI);

    if (night.selectedGames.length > 0) {
      const selectedGamesUI = renderSelectedGames(night, currentUser, nights);
      li.appendChild(selectedGamesUI);
    }
    container.appendChild(li);
 }); 
}

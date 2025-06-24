import { renderSelectedGames } from './renderSelectedGames.js';
import { renderRSVP } from './renderRSVP.js';
import { renderSuggestions } from './renderSuggestions.js';
import { renderGameNightAdminControls, renderAdminActions } from './renderGameNightAdminControls.js';
import { isAdmin } from '../auth/auth.js';
/**
 * Renders a list of game nights with RSVP, suggestions, and admin controls.
 * @param {Array} nights - Array of game night objects.
 * @param {Object} currentUser - The current user object.
 */


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

    if (isAdmin(currentUser)) {
      container.appendChild(renderGameNightAdminControls(night));
      container.appendChild(renderAdminActions(night, nights));
    }

    container.appendChild(li);
 }); 
}

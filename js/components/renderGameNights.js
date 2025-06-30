import { renderGameNightSummary } from './renderGameNightSummary.js';
import { renderRSVP } from './renderRSVP.js';
import { renderSuggestions } from './renderSuggestions.js';
import { renderSelectedGames } from './renderSelectedGames.js';
import { renderHostGameControls, renderHostActions } from './renderGameNightHostControls.js';
import { isHost } from '../auth/permissions.js';

export function renderGameNights(nights, currentUser, expandedNightIds = new Set()) {
  const container = document.getElementById('gameNightList');
  container.innerHTML = '';

  nights.forEach(night => {
    const li = document.createElement('li');
    li.className = 'game-card';

    const isExpanded = expandedNightIds.has(night.id);

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = isExpanded ? 'Collapse' : 'Expand';
    toggleBtn.onclick = () => {
      if (isExpanded) {
        expandedNightIds.delete(night.id);
      } else {
        expandedNightIds.add(night.id);
      }
      renderGameNights(nights, currentUser, expandedNightIds);
    };
    li.appendChild(toggleBtn);

    // Summary or Detail content
    if (isExpanded) {
      if (night.location) {
        const locationLine = document.createElement('div');
        locationLine.textContent = `📍 Location: ${night.location}`;
        wrapper.appendChild(locationLine);
      }

      if (night.description) {
        const descLine = document.createElement('div');
        descLine.textContent = `📝 ${night.description}`;
        wrapper.appendChild(descLine);
      }


      const rsvpUI = renderRSVP(night, nights);
      li.appendChild(rsvpUI);

      const suggestionsUI = renderSuggestions(night, nights);
      li.appendChild(suggestionsUI);

      if (Object.keys(night.selectedGames).length > 0) {
        const selectedGamesUI = renderSelectedGames(night, currentUser, nights);
        li.appendChild(selectedGamesUI);
      }

      if (isHost(currentUser, night)) {
        li.appendChild(renderHostGameControls(night, nights));
        li.appendChild(renderHostActions(night, nights));
      }

    } else {
      const summary = renderGameNightSummary(night);
      li.appendChild(summary);
    }

    container.appendChild(li);
  });
}

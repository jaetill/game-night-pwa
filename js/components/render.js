// Core imports
import { syncAndRender } from '../utils/sync.js';
import { isAdmin, currentUser } from '../data/state.js';
import { ownedGames } from '../data/state.js'; // or import from bgg.js if that’s where it's still updated

// Component helpers
import { renderSummary } from './renderSummary.js';
import { renderRSVP } from './renderRSVP.js';
import { renderSuggestions } from './renderSuggestions.js';
import { renderAdminTools } from './renderAdminTools.js';
import { renderSelectedGames } from './renderSelectedGames.js';

export function renderGameNights(nights) {
  const gameList = document.getElementById('gameList');
  gameList.innerHTML = '';
  gameList.className = 'game-list';

  if (!nights.length) {
    gameList.innerHTML = '<li>No game nights scheduled.</li>';
    return;
  }

  nights
    .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
    .forEach(night => {
      const card = document.createElement('div');
      card.className = 'game-card';

      const summary = renderSummary(night);
      const toggleBtn = document.createElement('button');
      toggleBtn.textContent = 'Show Details ▾';

      const detailsDiv = document.createElement('div');
      detailsDiv.style.display = 'none';
      detailsDiv.style.marginTop = '0.5em';

      if (night.snacks) {
        const snackP = document.createElement('p');
        snackP.textContent = `🥨 Snacks: ${night.snacks}`;
        detailsDiv.appendChild(snackP);
      }

      detailsDiv.appendChild(renderRSVP(night, nights));
      detailsDiv.appendChild(renderSuggestions(night, nights));
      if (isAdmin) {
        detailsDiv.appendChild(renderAdminTools(night, nights, ownedGames));
      }
      detailsDiv.appendChild(renderSelectedGames(night, ownedGames));

      toggleBtn.onclick = () => {
        const isOpen = detailsDiv.style.display === 'block';
        detailsDiv.style.display = isOpen ? 'none' : 'block';
        toggleBtn.textContent = isOpen ? 'Show Details ▾' : 'Hide Details ▴';
      };

      card.appendChild(summary);
      card.appendChild(toggleBtn);
      card.appendChild(detailsDiv);
      gameList.appendChild(card);
    });
}

import { renderGameNightSummary } from './renderGameNightSummary.js';
import { renderRSVP } from './renderRSVP.js';
import { renderSuggestions } from './renderSuggestions.js';
import { renderSelectedGames } from './renderSelectedGames.js';
import { renderHostGameControls, renderHostActions } from './renderGameNightHostControls.js';
import { isHost } from '../auth/permissions.js';
import { btn } from '../ui/elements.js';

// Persisted across re-renders so expansion state survives syncAndRender calls.
const expandedNightIds = new Set();

export function renderGameNights(nights, currentUser) {
  const container = document.getElementById('gameNightList');
  if (!container) return;
  container.innerHTML = '';

  if (!nights.length) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <div class="text-4xl mb-2">🎲</div>
        <p class="font-medium">No game nights yet</p>
        <p class="text-sm">Create one below to get started!</p>
      </div>`;
    return;
  }

  const sorted = [...nights].sort(
    (a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`)
  );

  sorted.forEach(night => {
    const isExpanded = expandedNightIds.has(night.id);

    const card = document.createElement('li');
    card.className = 'card list-none';

    // Summary row (always visible)
    const summaryRow = document.createElement('div');
    summaryRow.className = 'flex items-start justify-between gap-3';

    const summaryLeft = renderGameNightSummary(night, currentUser);
    summaryLeft.className = 'flex-1 min-w-0';

    const toggleBtn = btn(isExpanded ? 'Close ▴' : 'Details ▾', 'ghost');
    toggleBtn.className += ' shrink-0 text-xs';
    toggleBtn.onclick = () => {
      isExpanded ? expandedNightIds.delete(night.id) : expandedNightIds.add(night.id);
      renderGameNights(nights, currentUser, expandedNightIds);
    };

    summaryRow.appendChild(summaryLeft);
    summaryRow.appendChild(toggleBtn);
    card.appendChild(summaryRow);

    if (isExpanded) {
      const details = document.createElement('div');
      details.className = 'card-section space-y-4';

      if (night.description) {
        const desc = document.createElement('p');
        desc.className = 'text-sm text-gray-600 italic';
        desc.textContent = night.description;
        details.appendChild(desc);
      }

      details.appendChild(renderRSVP(night, nights, currentUser));
      details.appendChild(renderSuggestions(night, nights));

      if (Object.keys(night.selectedGames || {}).length > 0) {
        details.appendChild(renderSelectedGames(night, currentUser, nights));
      }

      if (isHost(currentUser, night)) {
        const hostSection = document.createElement('div');
        hostSection.className = 'card-section';
        hostSection.appendChild(renderHostGameControls(night, nights));
        hostSection.appendChild(renderHostActions(night, nights));
        details.appendChild(hostSection);
      }

      card.appendChild(details);
    }

    container.appendChild(card);
  });
}

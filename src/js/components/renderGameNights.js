import { isHost } from '../auth/permissions.js';
import { btn } from '../ui/elements.js';

import { renderGameNightSummary } from './renderGameNightSummary.js';
import { renderRSVP, renderAttendeeGroups } from './renderRSVP.js';
import { renderSuggestions } from './renderSuggestions.js';
import { renderSelectedGames } from './renderSelectedGames.js';
import { renderHostGameControls, renderHostActions } from './renderGameNightHostControls.js';
import { renderFood } from './renderFood.js';

// Persisted across re-renders so expansion state survives syncAndRender calls.
const expandedNightIds = new Set();

export function renderGameNights(nights, currentUser) {
  const container = document.getElementById('gameNightList');
  if (!container) return;
  container.innerHTML = '';

  // Tombstones (deleted nights) stay in the `nights` array — which child
  // components receive and save, so deletions propagate on merge — but they
  // are never rendered.
  const visible = nights.filter(n => !n.deleted);

  if (!visible.length) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <div class="text-4xl mb-2">🎲</div>
        <p class="font-medium">No game nights yet</p>
        <p class="text-sm">Create one below to get started!</p>
      </div>`;
    return;
  }

  // Parse date+time as LOCAL time. `new Date('2026-08-07')` (date-only) parses
  // as UTC midnight, which in US timezones is the evening BEFORE — that bug
  // moved events into "Past nights" on the day they happened. Appending an
  // explicit time forces local-time parsing; missing/empty time falls back to
  // midnight so the Date is always valid.
  const nightStart = n => new Date(`${n.date}T${n.time || '00:00'}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sorted = [...visible].sort((a, b) => nightStart(a) - nightStart(b));

  const upcoming = sorted.filter(n => nightStart(n) >= today);
  const past     = sorted.filter(n => nightStart(n) <  today);

  function renderNightCard(night) {
    const isExpanded = expandedNightIds.has(night.id);

    const card = document.createElement('li');
    card.className = 'card list-none';

    const summaryRow = document.createElement('div');
    summaryRow.className = 'flex items-start justify-between gap-3';

    const summaryLeft = renderGameNightSummary(night, currentUser);
    summaryLeft.className = 'flex-1 min-w-0';

    const toggleBtn = btn(isExpanded ? 'Close ▴' : 'Details ▾', 'ghost');
    toggleBtn.className += ' shrink-0 text-xs';
    toggleBtn.onclick = () => {
      isExpanded ? expandedNightIds.delete(night.id) : expandedNightIds.add(night.id);
      renderGameNights(nights, currentUser);
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

      // RSVP action buttons only (attendee groups rendered below)
      details.appendChild(renderRSVP(night, nights, currentUser));

      // Games first — signed-up players are visible within each game card
      if (Object.keys(night.selectedGames || {}).length > 0) {
        details.appendChild(renderSelectedGames(night, currentUser, nights));
      }

      // Unassigned attendee groups (playing-but-no-game, any_game, if_needed, spectating)
      details.appendChild(renderAttendeeGroups(night, nights, currentUser));

      const foodEl = renderFood(night, nights, currentUser);
      if (foodEl) details.appendChild(foodEl);

      details.appendChild(renderSuggestions(night, nights));

      if (isHost(currentUser, night)) {
        const hostSection = document.createElement('div');
        hostSection.className = 'card-section';
        hostSection.appendChild(renderHostGameControls(night, nights));
        hostSection.appendChild(renderHostActions(night, nights));
        details.appendChild(hostSection);
      }

      card.appendChild(details);
    }

    return card;
  }

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <div class="text-4xl mb-2">🎲</div>
        <p class="font-medium">No upcoming game nights</p>
        <p class="text-sm">Create one below to get started!</p>
      </div>`;
  } else {
    upcoming.forEach(night => container.appendChild(renderNightCard(night)));
  }

  if (past.length > 0) {
    const pastSection = document.createElement('div');
    pastSection.className = 'mt-6';

    const pastHeader = document.createElement('button');
    pastHeader.type = 'button';
    pastHeader.className = 'w-full flex items-center justify-between text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 hover:text-gray-600';
    const pastHeaderOpen = pastSection.dataset.open !== 'true';
    pastHeader.innerHTML = `<span>Past nights (${past.length})</span><span>▼</span>`;

    const pastList = document.createElement('ul');
    pastList.className = 'space-y-3 hidden';

    pastHeader.onclick = () => {
      const hidden = pastList.classList.toggle('hidden');
      pastHeader.querySelector('span:last-child').textContent = hidden ? '▼' : '▲';
    };

    past.slice().reverse().forEach(night => pastList.appendChild(renderNightCard(night)));

    pastSection.appendChild(pastHeader);
    pastSection.appendChild(pastList);
    container.appendChild(pastSection);
  }
}

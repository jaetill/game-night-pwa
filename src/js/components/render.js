import { renderGameNights } from './renderGameNights.js';
import { renderGlobalHostPanel } from './renderGlobalHostPanel.js';

export function renderApp({ nights, currentUser }) {
  const root = document.getElementById('app');
  if (!root) { console.error('No #app element found in DOM.'); return; }

  root.innerHTML = '';

  // Section heading
  const heading = document.createElement('h2');
  heading.className = 'text-lg font-bold text-gray-700 mb-4';
  heading.textContent = 'Upcoming Game Nights';
  root.appendChild(heading);

  const listContainer = document.createElement('ul');
  listContainer.id = 'gameNightList';
  listContainer.className = 'space-y-1 p-0';
  root.appendChild(listContainer);

  renderGameNights(nights, currentUser);
  renderGlobalHostPanel();
}

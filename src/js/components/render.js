import { renderGameNights } from './renderGameNights.js';
import { renderGlobalHostPanel } from './renderGlobalHostPanel.js';
import { renderNotifyToggle } from './renderNotifyToggle.js';

export function renderApp({ nights, currentUser }) {
  const root = document.getElementById('app');
  if (!root) { console.error('No #app element found in DOM.'); return; }

  root.innerHTML = '';

  // Section heading + notification bell (bell renders only when the
  // browser supports Web Push — see renderNotifyToggle.js)
  const headingRow = document.createElement('div');
  headingRow.className = 'flex items-center justify-between mb-4';

  const heading = document.createElement('h2');
  heading.className = 'text-lg font-bold text-gray-700';
  heading.textContent = 'Upcoming Game Nights';
  headingRow.appendChild(heading);

  const bell = renderNotifyToggle();
  if (bell) headingRow.appendChild(bell);

  root.appendChild(headingRow);

  const listContainer = document.createElement('ul');
  listContainer.id = 'gameNightList';
  listContainer.className = 'space-y-1 p-0';
  root.appendChild(listContainer);

  renderGameNights(nights, currentUser);
  renderGlobalHostPanel();
}

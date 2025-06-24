import { renderGameNights } from './renderGameNights.js';
import { renderGlobalAdminPanel } from './renderGlobalAdminPanel.js';

export function renderApp({ nights, isAdmin, currentUser }) {
  const root = document.getElementById('app');
  if (!root) {
    console.error('No #app element found in DOM.');
    return;
  }

  root.innerHTML = '';

  const listContainer = document.createElement('ul');
  listContainer.id = 'gameNightList';
  root.appendChild(listContainer);

  renderGameNights(nights, currentUser);

  if (isAdmin) {
    renderGlobalAdminPanel();
  }
}
// This function initializes the app by rendering the game nights and admin panel if applicable
// It checks for the existence of the root element and appends the game night list to it
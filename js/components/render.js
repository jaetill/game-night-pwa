import { renderGameNights } from './renderGameNights.js';
import { renderAdminTools } from './renderAdminTools.js';

export function renderApp({ nights, isAdmin, currentUser }) {
  const root = document.getElementById('app');
  root.innerHTML = '';

  const listContainer = document.createElement('ul');
  listContainer.id = 'gameNightList';
  root.appendChild(listContainer);

  renderGameNights(nights, currentUser);

  if (isAdmin) {
    const adminUI = renderAdminTools(null, nights);
    root.appendChild(adminUI);

    // Optionally reveal legacy admin sections
    const scheduler = document.getElementById('schedulerSection');
    if (scheduler) scheduler.style.display = 'block';
  }
}

// This function initializes the app by rendering the game nights and admin tools if applicable
// It uses the current user and game nights data to populate the UI
import { loadGameNights, fetchOwnedGames} from './data/index.js';
import { getCurrentUser, isAdmin } from './auth/auth.js';

import { renderApp } from './components/render.js';
import { setupEventListeners } from './events/events.js';

async function init() {
  if (!getCurrentUser()) {
    console.error('No current user found. Please log in.');
    return;
  }

  const adminStatus = await isAdmin(getCurrentUser());
  const nights = await loadGameNights();
  await fetchOwnedGames("jaetill");

  renderApp({ nights, isAdmin: adminStatus, getCurrentUser() });
  // Initialize the app with game nights and admin tools if applicable
  // This will render the game nights and admin tools based on the current user and their role    
  setupEventListeners();
}

window.addEventListener('DOMContentLoaded', init);

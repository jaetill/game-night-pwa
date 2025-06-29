import { loadGameNights, fetchOwnedGames } from './data/index.js';
import { getCurrentUser } from './auth/auth.js';

import { renderApp } from './components/render.js';
import { setupEventListeners } from './events/events.js';

async function init() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    console.error('No current user found. Please log in.');
    return;
  }

  const nights = await loadGameNights();
  await fetchOwnedGames(currentUser.username || 'default');

  renderApp({ nights, currentUser });

  setupEventListeners();
}

window.addEventListener('DOMContentLoaded', init);
// Ensure the app initializes after the DOM is fully loaded
// This function fetches game nights and owned games, then renders the app
// It also sets up event listeners for user interactions
// The init function is called when the DOM content is fully loaded 
// This ensures that the app is ready to interact with the user
// and that all necessary data is available before rendering the UI

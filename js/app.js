import {
  currentUser,
  loadGameNights,
  isAdmin as getIsAdmin,
  fetchOwnedGames
} from './data/index.js';

import { renderApp } from './components/render.js';
import { setupEventListeners } from './events/events.js';

async function init() {
  if (!currentUser) {
    console.error('No current user found. Please log in.');
    return;
  }

  const isAdmin = await getIsAdmin(currentUser);
  const nights = await loadGameNights();
  await fetchOwnedGames("jaetill");

  renderApp({ nights, isAdmin, currentUser });
  setupEventListeners();
}

window.addEventListener('DOMContentLoaded', init);

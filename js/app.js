//Import statements
import {
  currentUser,
  loadGameNights,
  isAdmin,
  fetchOwnedGames
} from './data/index.js';


import { renderGameNights } from './components/index.js';

import { setupEventListeners } from './events/events.js';

//App initialization
async function init() {
  window.addEventListener('DOMContentLoaded', init);
  console.log('🌟 Game Night Planner initialized!');
  const nights = await loadGameNights(); // handles cloud + fallback
  await fetchOwnedGames("jaetill"); // async, non-blocking
  renderGameNights(nights, currentUser);

  // ✅ Reveal scheduler if admin
  if (isAdmin) {
    document.getElementById('schedulerSection').style.display = 'block';
  }

  setupEventListeners(); // form buttons, date input, etc.
}

init();
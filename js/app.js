//Import statements
import {
  currentUser,
  loadGameNights,
  syncGameNights,
  isAdmin,
  fetchOwnedGames
} from '../data/index.js';

import {
  renderSummary,
  renderRSVP,
  renderSuggestions,
  renderAdminTools,
  renderSelectedGames
} from '../components/index.js';
import { renderGameNights } from './components/render.js';

import { setupEventListeners } from './events/events.js';

//App initialization
async function init() {
  const nights = await loadGameNights(); // handles cloud + fallback
  renderGameNights(nights);
  setupEventListeners(); // form buttons, date input, etc.
  fetchOwnedGames("jaetill"); // async, non-blocking
}

init();
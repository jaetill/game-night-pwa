
import { loadGameNights, syncAndRender } from './storage.js';
import { renderGameNights } from './render.js';
import { setupEventListeners } from './events.js';
import { fetchOwnedGames } from './bgg.js';

async function init() {
  const nights = await loadGameNights(); // handles cloud + fallback
  renderGameNights(nights);
  setupEventListeners(); // form buttons, date input, etc.
  fetchOwnedGames("jaetill"); // async, non-blocking
}

init();

import { loadGameNights, syncAndRender } from './data/storage.js';
import { renderGameNights } from './components/render.js';
import { setupEventListeners } from './events/events.js';
import { fetchOwnedGames } from './data/bgg.js';

async function init() {
  const nights = await loadGameNights(); // handles cloud + fallback
  renderGameNights(nights);
  setupEventListeners(); // form buttons, date input, etc.
  fetchOwnedGames("jaetill"); // async, non-blocking
}

init();
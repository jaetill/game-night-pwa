import { loadGameNights, saveGameNights } from '../data/index.js';
import { getCurrentUser } from '../auth/auth.js';
import { renderGameNights } from '../components/renderGameNights.js';

/**
 * Loads or accepts game night data, saves it locally and to the cloud, then renders.
 */
export async function syncAndRender(nightsData) {
  const nights = nightsData ?? await loadGameNights();
  if (!Array.isArray(nights)) {
    console.warn("⚠️ syncAndRender: loaded data is not an array", nights);
    return;
  }

  console.log("Loaded nights:", nights.map(n => n.selectedGames));

  await saveGameNights(nights);
  renderGameNights(nights, getCurrentUser());
}

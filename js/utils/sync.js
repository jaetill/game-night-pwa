import { loadGameNights, syncGameNights } from '../data/index.js';
import { renderGameNights } from '../components/render.js';

export async function syncAndRender(nightsData) {
  const nights = nightsData ?? await loadGameNights();
  if (!Array.isArray(nights)) {
    console.warn("⚠️ syncAndRender: loaded data is not an array", nights);
    return;
  }
  console.log("Loaded nights:", nights.map(n => n.selectedGames));

  syncGameNights(nights);
  renderGameNights(nights);
}

import { loadGameNights, syncGameNights } from '../data/index.js';
import { renderGameNights } from '../components/render.js';

export async function syncAndRender() {
  const nights = await loadGameNights(); // ✅ actually resolves the Promise now
  if (!Array.isArray(nights)) {
    console.warn("⚠️ syncAndRender: loaded data is not an array", nights);
    return;
  }

  syncGameNights(nights);
  renderGameNights(nights);
}

import { loadGameNights, syncGameNights } from '../data/index.js';
import { renderGameNights } from '../components/render.js';

export function syncAndRender() {
  const nights = loadGameNights();
  syncGameNights(nights);
  renderGameNights(nights);
}

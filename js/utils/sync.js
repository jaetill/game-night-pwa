import { syncGameNights } from '../data/storage.js';
import { renderGameNights } from '../components/render.js';

export function syncAndRender(nights) {
  syncGameNights(nights);
  renderGameNights(nights);
}

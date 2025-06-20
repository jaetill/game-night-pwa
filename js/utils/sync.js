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
  renderSelectedGames,
  renderGameNights
} from '../components/index.js';

export function syncAndRender(nights) {
  syncGameNights(nights);
  renderGameNights(nights);
}

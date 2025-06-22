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
  //renderAdminTools, // Uncomment if admin tools are needed
  renderSelectedGames,
  renderGameNights
} from '../components/index.js';

export function syncAndRender(nights) {
  syncGameNights(nights);
  renderGameNights(nights);
}

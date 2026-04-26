import { loadGameNights, fetchOwnedGames } from './data/index.js';
import { renderApp } from './components/render.js';
import { setCurrentUser } from './auth/userStore.js';
import { loadProfile } from './auth/profile.js';
import { buildDirectoryFromNights } from './utils/userDirectory.js';
import { toastError } from './ui/toast.js';
import { isAuthenticated, startLogin, parseIdToken } from './auth.js';

const PORTAL_URL     = 'https://jaetill.com';
const REQUIRED_GROUP = 'game-night-users';

async function init() {
  // ── Auth gate: signed in? ──────────────────────────────────
  if (!isAuthenticated()) {
    return startLogin();
  }

  // ── Authz gate: invited to game-night? ─────────────────────
  const claims = parseIdToken() || {};
  const groups = Array.isArray(claims['cognito:groups']) ? claims['cognito:groups'] : [];
  if (!groups.includes(REQUIRED_GROUP)) {
    // Not invited — bounce back to portal where the user can see what they have access to.
    window.location.replace(PORTAL_URL);
    return;
  }

  // ── App init ───────────────────────────────────────────────
  try {
    const userId = claims['cognito:username'] || claims.sub;
    const name   = claims.name  || userId;
    const email  = claims.email || '';

    setCurrentUser({ userId, name, email, bggUsername: '' });
    await loadProfile();

    const nights = await loadGameNights();
    fetchOwnedGames(userId).catch(() => {});

    buildDirectoryFromNights(nights);
    renderApp({ nights, currentUser: { userId, name, email } });
  } catch (err) {
    console.error('Init failed:', err);
    const container = document.getElementById('gameNightList');
    if (container) {
      container.innerHTML = `<div class="text-center py-12 text-red-400">
        <p class="font-medium">Something went wrong loading the app.</p>
        <p class="text-sm mt-1">Try refreshing. If it keeps happening, sign out and back in.</p>
      </div>`;
    }
    toastError('Something went wrong loading the app.');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  init();
});

import { getIdToken, refresh, startLogin, isAuthenticated } from '../auth.js';

// Deduplicates concurrent refresh attempts — several components fire API
// calls in parallel on load; only one token refresh should be in flight.
let refreshInFlight = null;

async function ensureFreshToken() {
  if (isAuthenticated()) return;

  // Token is expired (or inside the 60s early-expiry window). Refresh it.
  if (!refreshInFlight) {
    refreshInFlight = refresh().finally(() => { refreshInFlight = null; });
  }

  try {
    await refreshInFlight;
  } catch {
    // Refresh token invalid/revoked — restart the login flow. The Hosted UI
    // cookie usually makes this silent (no password prompt).
    await startLogin();
    // startLogin navigates away; block callers from proceeding meanwhile.
    return new Promise(() => {});
  }
}

/**
 * Wraps fetch() with an Authorization header containing the current
 * Cognito ID token, refreshing it first if expired. All API Gateway
 * calls must go through this.
 */
export async function authFetch(url, options = {}) {
  await ensureFreshToken();
  const token = getIdToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: token,
    },
  });
}

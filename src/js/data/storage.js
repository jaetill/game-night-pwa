import { getCurrentUser } from '../auth/userStore.js';
import { authFetch } from '../utils/authFetch.js';

const API_BASE = 'https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod';

/**
 * Ensures a game night object has full structure and valid fields.
 */
export function sanitizeNight(night) {
  let selectedGames = {};

  if (Array.isArray(night.selectedGames)) {
    night.selectedGames.forEach(g => {
      if (typeof g === 'string') {
        selectedGames[g] = { maxPlayers: 4, signedUpPlayers: [], interestedPlayers: [] };
      } else if (g.gameId) {
        selectedGames[g.gameId] = {
          maxPlayers: g.maxPlayers || 4,
          signedUpPlayers: Array.isArray(g.signedUpPlayers) ? g.signedUpPlayers : [],
          interestedPlayers: Array.isArray(g.interestedPlayers) ? g.interestedPlayers : [],
        };
      }
    });
  } else if (typeof night.selectedGames === 'object' && night.selectedGames !== null) {
    // Ensure interestedPlayers exists on every game entry
    for (const [key, game] of Object.entries(night.selectedGames)) {
      if (!Array.isArray(game.interestedPlayers)) {
        night.selectedGames[key] = { ...game, interestedPlayers: [] };
      }
    }
    selectedGames = night.selectedGames;
  }

  return {
    ...night,
    selectedGames,
    description: night.description || '',
    location: night.location || '',
    invited: Array.isArray(night.invited) ? night.invited : [],
    rsvps: Array.isArray(night.rsvps) ? night.rsvps : [],
    declined: Array.isArray(night.declined) ? night.declined : [],
    suggestions: Array.isArray(night.suggestions) ? night.suggestions : [],
    hostUserId: night.hostUserId || getCurrentUser().userId,
    lastModified: typeof night.lastModified === 'number' ? night.lastModified : Date.now()
  };
}

/**
 * Merges cloud and local game night data using most recent `lastModified`.
 */
function mergeNights(cloudNights, localNights) {
  const byId = new Map();
  const all = [...cloudNights, ...localNights].map(sanitizeNight);

  all.forEach(night => {
    const existing = byId.get(night.id);
    if (!existing || night.lastModified > existing.lastModified) {
      byId.set(night.id, night);
    }
  });

  return Array.from(byId.values());
}

/**
 * Saves game nights to localStorage.
 */
function syncGameNights(nights) {
  if (!Array.isArray(nights)) {
    console.warn('⚠️ syncGameNights received non-array data:', nights);
    return;
  }
  localStorage.setItem('gameNights', JSON.stringify(nights));
}

/**
 * Uploads the game nights array to the cloud.
 * The Lambda validates that the caller is authorised to make each change.
 */
export async function pushGameNightsToCloud(nights) {
  try {
    const res = await authFetch(`${API_BASE}/upload-token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(nights),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Upload failed: ${res.status}`);
    }
    console.log('✅ Game nights uploaded to cloud.');
  } catch (err) {
    console.warn('❌ Failed to push to cloud:', err.message);
  }
}

/**
 * Saves nights to both local and cloud, ensuring structure consistency.
 */
export async function saveGameNights(nights) {
  const sanitized = nights.map(sanitizeNight);
  try {
    syncGameNights(sanitized);
    await pushGameNightsToCloud(sanitized);
  } catch (err) {
    console.warn('💾 saveGameNights failed:', err);
  }
}

/**
 * Loads cloud and local data, merges, saves locally, and uploads merged set.
 * Always requests a fresh presigned URL and retries if expired.
 */
export async function loadGameNights() {
  try {
    const tokenRes = await authFetch(`${API_BASE}/get-token`);
    if (!tokenRes.ok) throw new Error(`Failed to get download URL: ${tokenRes.status}`);
    const { url } = await tokenRes.json();

    let dataRes = await fetch(url);

    // Retry if URL expired
    if (dataRes.status === 403) {
      console.warn("Download URL expired, retrying...");
      const retryTokenRes = await authFetch(`${API_BASE}/get-token`);
      const { url: retryUrl } = await retryTokenRes.json();
      dataRes = await fetch(retryUrl);
    }

    if (!dataRes.ok) throw new Error(`Download failed: ${dataRes.status}`);
    const cloudData = await dataRes.json();

    const localData = JSON.parse(localStorage.getItem('gameNights') || '[]');
    const merged = mergeNights(cloudData, localData);

    syncGameNights(merged);
    localStorage.setItem('gameNightsCloud', JSON.stringify(cloudData));
    await pushGameNightsToCloud(merged);

    return merged;
  } catch (err) {
    console.warn('🪫 Cloud load failed. Using local data.', err);
    const fallbackData = JSON.parse(localStorage.getItem('gameNights') || '[]');
    return fallbackData.map(sanitizeNight);
  }
}

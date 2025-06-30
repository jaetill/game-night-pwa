import { getCurrentUser } from '../auth/userStore.js';

const API_BASE = 'https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod';

/**
 * Ensures a game night object has full structure and valid fields.
 */
export function sanitizeNight(night) {
  let selectedGames = {};

  if (Array.isArray(night.selectedGames)) {
    night.selectedGames.forEach(g => {
      if (typeof g === 'string') {
        selectedGames[g] = { maxPlayers: 4, signedUpPlayers: [] };
      } else if (g.gameId) {
        selectedGames[g.gameId] = {
          maxPlayers: g.maxPlayers || 4,
          signedUpPlayers: Array.isArray(g.signedUpPlayers) ? g.signedUpPlayers : []
        };
      }
    });
  } else if (typeof night.selectedGames === 'object' && night.selectedGames !== null) {
    selectedGames = night.selectedGames;
  }

  return {
    ...night,
    selectedGames,
    rsvps: Array.isArray(night.rsvps) ? night.rsvps : [],
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
 * Uploads the game nights array to the cloud via S3 upload token.
 */
export async function pushGameNightsToCloud(nights) {
  try {
    const res = await fetch(`${API_BASE}/upload-token`);
    if (!res.ok) throw new Error(`Failed to get upload URL: ${res.status}`);
    const { url, fields } = await res.json();

    const formData = new FormData();
    Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
    formData.append('file', new Blob([JSON.stringify(nights)], { type: 'application/json' }));

    const uploadRes = await fetch(url, { method: 'POST', body: formData });
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

    console.log('✅ Game nights uploaded to cloud.');
  } catch (err) {
    console.warn('❌ Failed to push to cloud:', err);
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
 */
export async function loadGameNights() {
  try {
    const tokenRes = await fetch(`${API_BASE}/get-token`);
    const { url } = await tokenRes.json();
    const dataRes = await fetch(url);
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

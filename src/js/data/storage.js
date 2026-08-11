import { getCurrentUser } from '../auth/userStore.js';
import { authFetch } from '../utils/authFetch.js';
import { API_BASE } from '../config.js';

/**
 * Ensures a game night object has full structure and valid fields.
 * Tombstones (deleted nights) pass through untouched — they intentionally
 * carry only { id, hostUserId, deleted, lastModified }.
 */
export function sanitizeNight(night) {
  if (night.deleted) {
    return {
      id:           night.id,
      hostUserId:   night.hostUserId,
      deleted:      true,
      lastModified: typeof night.lastModified === 'number' ? night.lastModified : Date.now(),
    };
  }

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
    hostUserId: night.hostUserId || getCurrentUser()?.userId,
    lastModified: typeof night.lastModified === 'number' ? night.lastModified : Date.now()
  };
}

/**
 * Returns a tombstone for a night — used instead of removing it from the
 * array so other clients learn about the deletion on merge instead of
 * resurrecting the night from their localStorage.
 */
export function tombstoneNight(night) {
  return {
    id:           night.id,
    hostUserId:   night.hostUserId,
    deleted:      true,
    lastModified: Date.now(),
  };
}

/**
 * Merges cloud and local game night data using most recent `lastModified`.
 * Tombstones win like any other version — a deletion is just a newer write.
 * Exported for tests.
 */
export function mergeNights(cloudNights, localNights) {
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
 * Drops "zombie" nights: local-only entries hosted by someone else. Nights
 * hosted by other people can only ever have arrived FROM the cloud, so if the
 * cloud no longer has one (deleted before tombstones existed), the local copy
 * is stale and pushing it would be rejected by the server. Own nights are
 * kept — they may be freshly created and not yet uploaded.
 * Exported for tests.
 */
export function dropZombieNights(merged, cloudNights, currentUserId) {
  const cloudIds = new Set(cloudNights.map(n => String(n.id)));
  return merged.filter(n =>
    cloudIds.has(String(n.id)) || n.hostUserId === currentUserId
  );
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
}

/**
 * Saves nights to cloud first; only commits to localStorage on success so a
 * failed upload doesn't leave local state ahead of cloud. Throws on failure —
 * callers catch and show toastError.
 */
export async function saveGameNights(nights) {
  const sanitized = nights.map(sanitizeNight);
  await pushGameNightsToCloud(sanitized);
  syncGameNights(sanitized);
}

/**
 * Loads cloud and local data, merges, and saves the merged view locally.
 *
 * Deliberately does NOT push back to the cloud on load — the old
 * push-on-every-load behavior meant every page view rewrote the shared file,
 * racing other users and resurrecting deleted nights. Local-only changes
 * (e.g. made while a save failed) reach the cloud on the next actual save.
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
    const merged = dropZombieNights(
      mergeNights(cloudData, localData),
      cloudData,
      getCurrentUser()?.userId,
    );

    syncGameNights(merged);
    localStorage.setItem('gameNightsCloud', JSON.stringify(cloudData));

    return merged;
  } catch (err) {
    console.warn('🪫 Cloud load failed. Using local data.', err);
    const fallbackData = JSON.parse(localStorage.getItem('gameNights') || '[]');
    return fallbackData.map(sanitizeNight);
  }
}

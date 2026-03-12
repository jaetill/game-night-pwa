import { ownedGames } from './state.js';

const API_BASE   = 'https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod';
const CACHE_VER  = '4'; // bump to invalidate old caches

function cacheKey(userId)    { return `bggGames_${userId}`; }
function cacheVerKey(userId) { return `bggGamesVer_${userId}`; }

/**
 * Loads the user's game collection from S3 (uploaded via importCollection).
 * Falls back to localStorage cache if the network request fails.
 */
export async function fetchOwnedGames(userId) {
  if (!userId) return;

  // Try localStorage cache first
  const cachedVer  = localStorage.getItem(cacheVerKey(userId));
  const cachedData = localStorage.getItem(cacheKey(userId));

  if (cachedVer === CACHE_VER && cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      if (parsed.length > 0) {
        ownedGames.length = 0;
        ownedGames.push(...parsed);
        console.log(`BGG: loaded ${parsed.length} games from cache.`);
        // Refresh from S3 in the background without blocking render
        refreshFromS3(userId).catch(() => {});
        return;
      }
    } catch {
      console.warn('BGG: corrupt cache, fetching from S3.');
    }
  }

  await refreshFromS3(userId);
}

async function refreshFromS3(userId) {
  try {
    const tokenRes = await fetch(`${API_BASE}/get-token?key=collections/${userId}.json`);
    if (!tokenRes.ok) throw new Error(`Token fetch failed: ${tokenRes.status}`);
    const { url } = await tokenRes.json();

    const dataRes = await fetch(url);
    if (dataRes.status === 403 || dataRes.status === 404) {
      console.log('BGG: no collection stored yet. Use Profile → Import Collection.');
      return;
    }
    if (!dataRes.ok) throw new Error(`S3 fetch failed: ${dataRes.status}`);

    const games = await dataRes.json();
    if (!Array.isArray(games) || games.length === 0) return;

    ownedGames.length = 0;
    ownedGames.push(...games);

    localStorage.setItem(cacheKey(userId),    JSON.stringify(games));
    localStorage.setItem(cacheVerKey(userId), CACHE_VER);
    console.log(`BGG: loaded ${games.length} games from S3.`);
  } catch (err) {
    console.warn('BGG: could not load collection from S3:', err.message);
  }
}

/**
 * Saves a parsed game collection to S3 and updates local state + cache.
 * Called by the import modal after parsing BGG XML.
 */
export async function saveCollection(userId, games) {
  const tokenRes = await fetch(`${API_BASE}/upload-token?key=collections/${userId}.json`);
  if (!tokenRes.ok) throw new Error(`Upload token failed: ${tokenRes.status}`);
  const { url, fields } = await tokenRes.json();

  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  form.append('file', new Blob([JSON.stringify(games)], { type: 'application/json' }));

  const uploadRes = await fetch(url, { method: 'POST', body: form });
  if (!uploadRes.ok) throw new Error(`S3 upload failed: ${uploadRes.status}`);

  ownedGames.length = 0;
  ownedGames.push(...games);

  localStorage.setItem(cacheKey(userId),    JSON.stringify(games));
  localStorage.setItem(cacheVerKey(userId), CACHE_VER);
  console.log(`BGG: saved ${games.length} games to S3.`);
}

/**
 * Parses a BGG collection XML string into a normalised game array.
 * The collection XML already contains thumbnails and player counts,
 * so no second API call is needed.
 */
export function parseBggCollectionXml(xmlText) {
  const xml   = new DOMParser().parseFromString(xmlText, 'text/xml');
  const error = xml.querySelector('parsererror');
  if (error) throw new Error('Invalid XML');

  const message = xml.querySelector('message');
  if (message) throw new Error('BGG is still processing your collection. Wait a moment and try again.');

  return [...xml.querySelectorAll('item')].map(item => {
    const stats = item.querySelector('stats');
    return {
      id:         item.getAttribute('objectid'),
      title:      item.querySelector('name')?.textContent?.trim() || 'Untitled',
      thumbnail:  item.querySelector('thumbnail')?.textContent?.trim() || '',
      minPlayers: Number(stats?.getAttribute('minplayers')) || 1,
      maxPlayers: Number(stats?.getAttribute('maxplayers')) || 99,
    };
  }).filter(g => g.id && g.title !== 'Untitled');
}

export function clearBggCache(userId) {
  if (userId) {
    localStorage.removeItem(cacheKey(userId));
    localStorage.removeItem(cacheVerKey(userId));
  }
}

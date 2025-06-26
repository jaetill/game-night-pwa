// storage.js

const API_BASE = 'https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod';

export function sanitizeNight(night) {
  const selectedGames =
    Array.isArray(night.selectedGames) && typeof night.selectedGames[0] === 'string'
      ? night.selectedGames.map(gameId => ({
          gameId,
          maxPlayers: 4,
          signedUpPlayers: []
        }))
      : Array.isArray(night.selectedGames)
        ? night.selectedGames
        : [];

  return {
    ...night,
    selectedGames,
    rsvps: Array.isArray(night.rsvps) ? night.rsvps : [],
    suggestions: Array.isArray(night.suggestions) ? night.suggestions : [],
    hostUserId: night.hostUserId || getCurrentUser().userId,
    lastModified: typeof night.lastModified === 'number' ? night.lastModified : 0
  };
}


function mergeNights(cloudNights, localNights) {
  const byId = new Map();

  const allNights = [...cloudNights, ...localNights].map(sanitizeNight);

  allNights.forEach(night => {
    const existing = byId.get(night.id);
    if (!existing || night.lastModified > existing.lastModified) {
      byId.set(night.id, night);
    }
  });

  return Array.from(byId.values());
}


async function pushGameNightsToCloud(gameNights) {
  try {
    // Step 1: Get signed POST fields and URL from your backend
    const res = await fetch(`${API_BASE}/upload-token`);
    if (!res.ok) throw new Error(`Failed to get upload URL: ${res.status}`);
    const { url, fields } = await res.json();

    // Step 2: Build FormData for S3 POST
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.append(key, value);
    }
    formData.append(
      'file',
      new Blob([JSON.stringify(gameNights)], { type: 'application/json' })
    );

    // Step 3: POST to S3
    const uploadRes = await fetch(url, {
      method: 'POST',
      body: formData
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload failed: ${uploadRes.status}`);
    }

    console.log('✅ Game nights successfully uploaded via POST.');
  } catch (err) {
    console.warn('❌ Failed to upload game nights via POST:', err);
  }
}


export async function loadGameNights() {
  try {
    const tokenRes = await fetch(`${API_BASE}/get-token`);
    const { url } = await tokenRes.json();
    const dataRes = await fetch(url);
    const cloudData = await dataRes.json();

    console.log('☁️ Fetched cloudData:', cloudData);

    const localRaw = localStorage.getItem('gameNights') || '[]';
    const localData = JSON.parse(localRaw);

    const merged = mergeNights(cloudData, localData);

    localStorage.setItem('gameNights', JSON.stringify(merged));
    localStorage.setItem('gameNightsCloud', JSON.stringify(cloudData));

    await pushGameNightsToCloud(merged);

    return merged;
  } catch (err) {
    console.warn('🪫 Cloud load failed, falling back to localStorage.', err);

    const fallbackRaw = localStorage.getItem('gameNights') || '[]';
    const fallbackData = JSON.parse(fallbackRaw);

    return fallbackData.map(sanitizeNight);
  }
}

export function syncGameNights(nights) {
  if (!Array.isArray(nights)) {
    console.warn('⚠️ syncGameNights received non-array data:', nights);
    return;
  }

  localStorage.setItem('gameNights', JSON.stringify(nights));
}
// storage.js

const API_BASE = 'https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod';

function sanitizeNight(night) {
  return {
    ...night,
    selectedGames: Array.isArray(night.selectedGames) ? night.selectedGames : [],
    rsvps: Array.isArray(night.rsvps) ? night.rsvps : [],
    suggestions: Array.isArray(night.suggestions) ? night.suggestions : [],
    lastModified: typeof night.lastModified === 'number' ? night.lastModified : 0
  };
}

function mergeNights(cloudNights, localNights) {
  const byId = new Map();

  [...cloudNights, ...localNights].forEach(night => {
    const existing = byId.get(night.id);
    if (!existing || night.lastModified > existing.lastModified) {
      byId.set(night.id, sanitizeNight(night));
    }
  });

  return Array.from(byId.values());
}

async function pushGameNightsToCloud(gameNights) {
  try {
    const res = await fetch(`${API_BASE}/upload-token`);
    const { url } = await res.json();

    const uploadRes = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameNights)
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload failed: ${uploadRes.status}`);
    }

    console.log('✅ Game nights successfully pushed to cloud.');
  } catch (err) {
    console.warn('❌ Failed to push game nights to cloud:', err);
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
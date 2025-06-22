export async function loadGameNights() {
  try {
    const res = await fetch('https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod/get-token');
    const { url } = await res.json();
    const dataRes = await fetch(url);
    const cloudData = await dataRes.json();

    console.log("Fetched cloudData:", cloudData, Array.isArray(cloudData));

    if (Array.isArray(cloudData)) {
      const sanitized = cloudData.map(night => ({
        ...night,
        selectedGames: Array.isArray(night.selectedGames) ? night.selectedGames : [],
        rsvps: Array.isArray(night.rsvps) ? night.rsvps : [],
        suggestions: Array.isArray(night.suggestions) ? night.suggestions : []
      }));

      localStorage.setItem('gameNightsCloud', JSON.stringify(sanitized));
      return sanitized;
    } else {
      throw new Error("Cloud data is not an array.");
    }
  } catch (err) {
    console.warn('🪫 Cloud load failed, falling back to localStorage.', err);
    const localRaw = localStorage.getItem('gameNights') || '[]';
    const localData = JSON.parse(localRaw);

    return Array.isArray(localData)
      ? localData.map(night => ({
          ...night,
          selectedGames: Array.isArray(night.selectedGames) ? night.selectedGames : [],
          rsvps: Array.isArray(night.rsvps) ? night.rsvps : [],
          suggestions: Array.isArray(night.suggestions) ? night.suggestions : []
        }))
      : [];
  }
}


export function syncGameNights(nights) {
  console.log("Saving gameNights in storage.SyncGameNights:", nights, "Type:", typeof nights);
    if (!Array.isArray(nights)) {
    console.warn("⚠️ syncGameNights received non-array data:", nights);
    return;
  }
  localStorage.setItem("gameNights", JSON.stringify(nights));
  localStorage.setItem("gameNightsCloud", JSON.stringify(nights)); // simulate cloud sync
}

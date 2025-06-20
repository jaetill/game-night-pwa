export async function loadGameNights() {
  try {
    const res = await fetch('https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod/get-token');
    const { url } = await res.json();
    const dataRes = await fetch(url);
    const cloudData = await dataRes.json();

    // Optionally cache it
    localStorage.setItem('gameNightsCloud', JSON.stringify(cloudData));
    return cloudData;
  } catch (err) {
    console.warn('🪫 Cloud load failed, falling back to localStorage.', err);
    return JSON.parse(localStorage.getItem('gameNights') || '[]');
  }
}

export function syncGameNights(nights) {
  console.log("syncGameNights called")	
  localStorage.setItem("gameNights", JSON.stringify(nights));
  localStorage.setItem("gameNightsCloud", JSON.stringify(nights)); // simulate cloud sync
}

export function loadGameNights() {
  try {
    const cloud = JSON.parse(localStorage.getItem("gameNightsCloud"));
    return cloud || [];
  } catch {
    console.warn("🪫 Cloud load failed, using local.");
    return JSON.parse(localStorage.getItem("gameNights") || "[]");
  }
}

export function syncGameNights(nights) {
  console.log("syncGameNights called")	
  localStorage.setItem("gameNights", JSON.stringify(nights));
  localStorage.setItem("gameNightsCloud", JSON.stringify(nights)); // simulate cloud sync
}

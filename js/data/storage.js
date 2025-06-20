import { renderGameNights } from '../components/render.js';

export function loadGameNights() {
  try {
    const cloud = JSON.parse(localStorage.getItem("gameNightsCloud"));
    return cloud || [];
  } catch {
    console.warn("🪫 Cloud load failed, using local.");
    return JSON.parse(localStorage.getItem("gameNights") || "[]");
  }
}

export function syncAndRender(nights) {
  localStorage.setItem("gameNights", JSON.stringify(nights));
  localStorage.setItem("gameNightsCloud", JSON.stringify(nights)); // simulate cloud sync
  renderGameNights(nights); // you'll import this back in
}

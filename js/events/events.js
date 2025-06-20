import { createGameNight } from '../utils.js';
import { loadGameNights, syncAndRender } from '../data/storage.js';

export function setupEventListeners() {
  const form = document.getElementById("newNightForm");
  if (!form) return;

  form.onsubmit = (e) => {
    e.preventDefault();
    const date = form.date.value;
    const time = form.time.value;
    const snacks = form.snackNotes.value;
    const newNight = createGameNight({ date, time, snacks });
    const nights = loadGameNights();
    nights.push(newNight);
    syncAndRender(nights);
	console.log("Saving nights:", nights)
    form.reset();
  };
}

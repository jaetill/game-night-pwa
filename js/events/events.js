import { createGameNight } from '../utils/utils.js';
import { loadGameNights } from '../data/storage.js';
import { syncAndRender } from '../utils/sync.js';


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

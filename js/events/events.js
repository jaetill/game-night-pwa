import {
  createGameNight,
  syncAndRender
} from '../utils/index.js';
import {
  loadGameNights
} from '../data/index.js';

export function setupEventListeners() {
  const form = document.getElementById("scheduleForm");
  if (!form) return;

  form.onsubmit = (e) => {
    e.preventDefault();

    const date = form.date.value;
    const time = form.time.value;
    const snacks = form.snackNotes.value;
    const nights = loadGameNights();

    const editingId = localStorage.getItem('editingNightId');

    if (editingId) {
      // We're editing an existing night
      const index = nights.findIndex(n => n.id === editingId);
      if (index !== -1) {
        nights[index] = {
          ...nights[index],
          date,
          time,
          snacks
        };
      }
      localStorage.removeItem('editingNightId');
    } else {
      // Creating a new night
      const newNight = createGameNight({ date, time, snacks });
      nights.push(newNight);
    }

    syncAndRender(nights);
    form.reset();
  };
}

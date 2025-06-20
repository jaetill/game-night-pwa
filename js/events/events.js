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

  form.onsubmit = async (e) => {
    e.preventDefault();

    const date = document.getElementById('gameDate')?.value;
    const time = document.getElementById('gameTime')?.value;
    const snacks = document.getElementById('snackNotes')?.value;

    const nights = await loadGameNights(); // ✅ Await the async function

    const editingId = localStorage.getItem('editingNightId');

    if (editingId) {
      const index = nights.findIndex(n => n.id === editingId || n.id === Number(editingId));
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
      const newNight = createGameNight({ date, time, snacks });
      nights.push(newNight);
    }

    syncAndRender(nights);
    form.reset();
  };
}

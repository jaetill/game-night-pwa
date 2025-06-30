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
    const location = document.getElementById('location')?.value.trim();
    const description = document.getElementById('description')?.value.trim();

    if (!location) {
      alert('Please provide a location for the game night.');
      return;
    }

    const nights = await loadGameNights();

    const editingId = localStorage.getItem('editingNightId');

    if (editingId) {
      const index = nights.findIndex(n => n.id === editingId || n.id === Number(editingId));
      if (index !== -1) {
        nights[index] = {
          ...nights[index],
          date,
          time,
          snacks,
          location,
          description
        };
      }
      localStorage.removeItem('editingNightId');
    } else {
      const newNight = createGameNight({ date, time, snacks, location, description });
      const existing = nights.find(n => n.id === newNight.id);
      if (!existing) {
        nights.push(newNight);
      }
    }

    syncAndRender(nights);
    form.reset();
  };
}

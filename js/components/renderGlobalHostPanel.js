import { renderGameNightForm } from './renderGameNightForm.js';
import { renderGameNights } from './renderGameNights.js';
import { getCurrentUser } from '../auth/userStore.js';
import { loadGameNights } from '../data/index.js'; 
import { saveGameNights } from '../data/index.js';


export function renderGlobalHostPanel() {
  let scheduler = document.getElementById('schedulerSection');
  if (!scheduler) {
    scheduler = document.createElement('section');
    scheduler.id = 'schedulerSection';
    document.getElementById('app')?.appendChild(scheduler);
  }

  scheduler.innerHTML = ''; // or custom layout
  scheduler.style.display = 'block';

  const createBtn = document.createElement('button');
  createBtn.textContent = '🗓️ Create Game Night';
  createBtn.onclick = () => {
    const existing = document.getElementById('createNightForm');
    if (existing) {
      existing.remove();
      return;
    }

    renderGameNightForm({
      onSave: async newNight => {
        const nights = await loadGameNights();
        nights.push(newNight);
        await saveGameNights(nights);
        renderGameNights(nights, getCurrentUser());
      }
    });
  };



  scheduler.appendChild(createBtn);
}

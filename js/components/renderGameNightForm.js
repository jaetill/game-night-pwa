import { getCurrentUser } from '../auth/userStore.js';
import { loadGameNights, saveGameNights } from '../data/index.js';
import { renderGameNights } from './renderGameNights.js';

export function renderGameNightForm({ night = null, onSave }) {
  const scheduler = document.getElementById('schedulerSection');
  if (!scheduler) {
    console.warn('No #schedulerSection found.');
    return;
  }

  // Prevent duplicates
  if (scheduler.querySelector('#createNightForm')) return;

  const currentUser = getCurrentUser();
  if (!currentUser) {
    console.warn('No user session found.');
    return;
  }

  const form = document.createElement('form');
  form.id = 'createNightForm';
  form.style.margin = '1em 0';
  form.style.padding = '1em';
  form.style.border = '1px solid #ccc';
  form.style.borderRadius = '6px';
  form.style.maxWidth = '300px';
  form.style.background = '#f8f8f8';

  const heading = document.createElement('h4');
  heading.textContent = night ? 'Edit Game Night' : 'Create a New Game Night';

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.required = true;
  dateInput.value = night?.date || new Date().toISOString().split('T')[0];
  dateInput.style.marginBottom = '0.5em';
  dateInput.style.display = 'block';

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.required = true;
  timeInput.value = night?.time || '19:00';
  timeInput.style.marginBottom = '0.5em';
  timeInput.style.display = 'block';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = night ? 'Update Night' : 'Create Night';
  submitBtn.style.marginTop = '0.5em';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.marginLeft = '0.5em';
  cancelBtn.onclick = () => form.remove();

  form.append(heading, dateInput, timeInput, submitBtn, cancelBtn);
  scheduler.appendChild(form);

  form.onsubmit = async e => {
    e.preventDefault();

    const updatedNight = {
      ...(night || {}),
      id: night?.id || crypto.randomUUID(),
      date: dateInput.value,
      time: timeInput.value,
      hostUserId: night?.hostUserId || currentUser.userId,
      selectedGames: night?.selectedGames || [],
      rsvps: night?.rsvps || [],
      lastModified: Date.now(),
    };

    await onSave(updatedNight);

    form.remove();

    const confirmation = document.createElement('div');
    confirmation.textContent = night ? '✅ Game Night updated!' : '✅ Game Night created!';
    confirmation.style.marginTop = '0.5em';
    confirmation.style.fontSize = '0.9em';
    confirmation.style.color = 'green';
    scheduler.appendChild(confirmation);

    setTimeout(() => confirmation.remove(), 2500);
  };
}

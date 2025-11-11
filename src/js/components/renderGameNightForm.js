import { getCurrentUser } from '../auth/userStore.js';

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

  const locationInput = document.createElement('input');
  locationInput.type = 'text';
  locationInput.required = true;
  locationInput.placeholder = '123 Maple Lane or Zoom link';
  locationInput.value = night?.location || '';
  locationInput.style.marginBottom = '0.5em';
  locationInput.style.display = 'block';

  const descriptionInput = document.createElement('textarea');
  descriptionInput.placeholder = 'Casual night, bring your favorites!';
  descriptionInput.value = night?.description || '';
  descriptionInput.style.marginBottom = '0.5em';
  descriptionInput.style.display = 'block';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = night ? 'Update Night' : 'Create Night';
  submitBtn.style.marginTop = '0.5em';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.marginLeft = '0.5em';
  cancelBtn.onclick = () => form.remove();

  form.append(
  heading,
  dateInput,
  timeInput,
  locationInput,
  descriptionInput,
  submitBtn,
  cancelBtn
);

  scheduler.appendChild(form);

form.onsubmit = async e => {
  e.preventDefault();

  const updatedNight = {
    ...(night || {}),
    id: night?.id || crypto.randomUUID(),
    date: dateInput.value,
    time: timeInput.value,
    location: locationInput.value.trim(),
    description: descriptionInput.value.trim(),
    hostUserId: night?.hostUserId || currentUser.userId,
    selectedGames: night?.selectedGames || [],
    rsvps: (() => {
      // Start with existing RSVPs if editing
      const existing = night?.rsvps ? [...night.rsvps] : [];
      // Ensure host is included
      if (!existing.some(r => r.userId === currentUser.userId)) {
        existing.push({
          userId: currentUser.userId,
          timestamp: Date.now()
        });
      }
      return existing;
    })(),
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

import { getCurrentUser } from '../auth/getCurrentUser.js';

export function renderGameNightForm({ night = null, onSave }) {
  const form = document.createElement('form');
  form.style.margin = '1em 0';

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.required = true;
  dateInput.value = night?.date || '';

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.required = true;
  timeInput.value = night?.time || '';

  const submitBtn = document.createElement('button');
  submitBtn.textContent = night ? 'Update Night' : 'Create Night';
  submitBtn.type = 'submit';

  form.append(dateInput, timeInput, submitBtn);

  form.onsubmit = async e => {
    e.preventDefault();
    const updatedNight = {
      ...(night || {}),
      id: night?.id || crypto.randomUUID(),
      date: dateInput.value,
      time: timeInput.value,
      hostUserId: getCurrentUser().userId,
      selectedGames: night?.selectedGames || [],
      rsvps: night?.rsvps || [],
      lastModified: Date.now(),
    };
    await onSave(updatedNight);
  };

  document.getElementById('schedulerSection')?.appendChild(form);
}

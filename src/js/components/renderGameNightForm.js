import { getCurrentUser } from '../auth/userStore.js';
import { getProfile } from '../auth/profile.js';
import { toastSuccess, toastError } from '../ui/toast.js';
import { btn } from '../ui/elements.js';

export function renderGameNightForm({ night = null, onSave }) {
  // Remove any existing form
  document.getElementById('createNightForm')?.remove();

  const currentUser = getCurrentUser();
  if (!currentUser) return;

  // ── Build modal backdrop ─────────────────────────────────
  const backdrop = document.createElement('div');
  backdrop.id = 'createNightForm';
  backdrop.className = 'modal-backdrop';
  backdrop.onclick = e => { if (e.target === backdrop) backdrop.remove(); };

  const box = document.createElement('div');
  box.className = 'modal-box';
  backdrop.appendChild(box);

  // Header
  const heading = document.createElement('h3');
  heading.className = 'text-lg font-bold text-gray-900 mb-5';
  heading.textContent = night ? 'Edit Game Night' : 'Create a Game Night';
  box.appendChild(heading);

  // ── Fields ────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];

  function field(labelText, el) {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.className = 'block text-sm font-medium text-gray-700 mb-1';
    label.textContent = labelText;
    wrap.appendChild(label);
    wrap.appendChild(el);
    return wrap;
  }

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.required = true;
  dateInput.value = night?.date || today;
  dateInput.className = 'field';

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.required = true;
  timeInput.value = night?.time || '19:00';
  timeInput.className = 'field';

  const locationInput = document.createElement('input');
  locationInput.type = 'text';
  locationInput.required = true;
  locationInput.placeholder = '123 Maple Lane or Zoom link';
  locationInput.value = night?.location || (!night ? getProfile().address || '' : '');
  locationInput.className = 'field';

  const descInput = document.createElement('textarea');
  descInput.placeholder = 'Casual night, bring your favorites!';
  descInput.value = night?.description || '';
  descInput.rows = 3;
  descInput.className = 'field resize-none';

  const fields = document.createElement('div');
  fields.className = 'space-y-4 mb-6';
  fields.appendChild(field('Date', dateInput));
  fields.appendChild(field('Time', timeInput));
  fields.appendChild(field('Location', locationInput));
  fields.appendChild(field('Description (optional)', descInput));
  box.appendChild(fields);

  // ── Buttons ───────────────────────────────────────────────
  const btnRow = document.createElement('div');
  btnRow.className = 'flex gap-3';

  const submitBtn = btn(night ? 'Update' : 'Create Night', 'primary');
  submitBtn.className += ' flex-1 py-2';

  const cancelBtn = btn('Cancel', 'secondary');
  cancelBtn.className += ' flex-1 py-2';
  cancelBtn.onclick = () => backdrop.remove();

  btnRow.appendChild(submitBtn);
  btnRow.appendChild(cancelBtn);
  box.appendChild(btnRow);

  document.body.appendChild(backdrop);
  dateInput.focus();

  // ── Submit ────────────────────────────────────────────────
  submitBtn.onclick = async () => {
    if (!dateInput.value || !locationInput.value.trim()) {
      dateInput.reportValidity();
      locationInput.reportValidity();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      const existing = night?.rsvps ? [...night.rsvps] : [];
      if (!existing.some(r => r.userId === currentUser.userId)) {
        existing.push({ userId: currentUser.userId, name: currentUser.name, type: 'playing', timestamp: Date.now() });
      }

      const updatedNight = {
        ...(night || {}),
        id: night?.id || crypto.randomUUID(),
        date: dateInput.value,
        time: timeInput.value,
        location: locationInput.value.trim(),
        description: descInput.value.trim(),
        hostUserId: night?.hostUserId || currentUser.userId,
        selectedGames: night?.selectedGames || {},
        rsvps: existing,
        lastModified: Date.now(),
      };

      await onSave(updatedNight);
      backdrop.remove();
      toastSuccess(night ? 'Event updated!' : 'Game night created!');
    } catch {
      toastError('Could not save. Try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = night ? 'Update' : 'Create Night';
    }
  };
}

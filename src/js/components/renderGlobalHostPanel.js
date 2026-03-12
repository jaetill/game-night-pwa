import { renderGameNightForm } from './renderGameNightForm.js';
import { renderGameNights } from './renderGameNights.js';
import { getCurrentUser } from '../auth/userStore.js';
import { loadGameNights, saveGameNights } from '../data/index.js';
import { btn } from '../ui/elements.js';
import { toastError } from '../ui/toast.js';

export function renderGlobalHostPanel() {
  let panel = document.getElementById('schedulerSection');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'schedulerSection';
    document.getElementById('app')?.appendChild(panel);
  }

  panel.innerHTML = '';
  panel.className = 'mt-6';

  const createBtn = btn('＋ Schedule a Game Night', 'primary');
  createBtn.className += ' w-full py-2.5 text-base';

  createBtn.onclick = () => {
    renderGameNightForm({
      onSave: async newNight => {
        try {
          const nights = await loadGameNights();
          nights.push(newNight);
          await saveGameNights(nights);
          renderGameNights(nights, getCurrentUser());
        } catch {
          toastError('Could not save game night.');
        }
      }
    });
  };

  panel.appendChild(createBtn);
}

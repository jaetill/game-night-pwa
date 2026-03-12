import { withdrawFromAllGames } from '../utils/index.js';
import { getCurrentUser } from '../auth/userStore.js';
import { saveGameNights } from '../data/index.js';
import { renderGameNights } from './renderGameNights.js';
import { sanitizeNight } from '../data/storage.js';
import { DEBUG_MODE } from '../config.js';
import { getDisplayName } from '../utils/userDirectory.js';
import { btn } from '../ui/elements.js';
import { toastSuccess, toastError } from '../ui/toast.js';

export function renderRSVP(night, nights, currentUser) {
  const wrapper = document.createElement('div');
  currentUser = currentUser || getCurrentUser();
  if (!currentUser) return wrapper;

  const { userId } = currentUser;
  const alreadyRSVPd   = night.rsvps?.some(r => r.userId === userId);
  const alreadyDeclined = night.declined?.includes(userId);
  const isInvited       = night.invited?.includes(userId);

  const section = document.createElement('div');
  section.className = 'space-y-3';

  // ── Action buttons ───────────────────────────────────────
  if (isInvited && !alreadyRSVPd && !alreadyDeclined) {
    const actions = document.createElement('div');
    actions.className = 'flex gap-2';

    const rsvpBtn = btn("I'm going! 🎟", 'primary');
    rsvpBtn.onclick = async () => {
      rsvpBtn.disabled = true;
      rsvpBtn.textContent = 'Saving…';
      try {
        night.rsvps = Array.isArray(night.rsvps) ? night.rsvps : [];
        night.rsvps.push({ userId, name: currentUser.name || currentUser.userId });
        night.lastModified = Date.now();
        sanitizeNight(night);
        await saveGameNights(nights);
        renderGameNights(nights, currentUser);
        toastSuccess("You're on the list!");
      } catch {
        toastError('Could not save RSVP. Try again.');
        rsvpBtn.disabled = false;
        rsvpBtn.textContent = "I'm going! 🎟";
      }
    };

    const declineBtn = btn('Not attending', 'ghost');
    declineBtn.onclick = async () => {
      declineBtn.disabled = true;
      try {
        night.declined = Array.isArray(night.declined) ? night.declined : [];
        night.declined.push(userId);
        night.lastModified = Date.now();
        sanitizeNight(night);
        await saveGameNights(nights);
        renderGameNights(nights, currentUser);
        toastInfo('Marked as not attending.');
      } catch {
        toastError('Could not save. Try again.');
        declineBtn.disabled = false;
      }
    };

    actions.appendChild(rsvpBtn);
    actions.appendChild(declineBtn);
    section.appendChild(actions);
  }

  // ── Attendee list ────────────────────────────────────────
  if (Array.isArray(night.rsvps) && night.rsvps.length > 0) {
    const label = document.createElement('span');
    label.className = 'section-label';
    label.textContent = 'Attending';
    section.appendChild(label);

    const list = document.createElement('ul');
    list.className = 'space-y-1';

    night.rsvps.forEach((rsvp, i) => {
      const item = document.createElement('li');
      item.className = 'flex items-center justify-between text-sm';

      const name = document.createElement('span');
      name.className = 'text-gray-700';
      name.textContent = `🎟 ${rsvp.name || getDisplayName(rsvp.userId)}`;
      item.appendChild(name);

      if (rsvp.userId === userId) {
        const cancelBtn = btn('Cancel RSVP', 'danger');
        cancelBtn.className += ' text-xs py-0.5 px-2';
        cancelBtn.onclick = async () => {
          cancelBtn.disabled = true;
          try {
            night.rsvps.splice(i, 1);
            withdrawFromAllGames(night, currentUser);
            night.lastModified = Date.now();
            sanitizeNight(night);
            await saveGameNights(nights);
            renderGameNights(nights, currentUser);
            toastInfo('RSVP cancelled.');
          } catch {
            toastError('Could not cancel. Try again.');
            cancelBtn.disabled = false;
          }
        };
        item.appendChild(cancelBtn);
      }

      list.appendChild(item);
    });

    section.appendChild(list);
  }

  // ── Pending invites ──────────────────────────────────────
  const pending = (night.invited || []).filter(
    id => !night.rsvps?.some(r => r.userId === id) && !night.declined?.includes(id)
  );

  if (pending.length > 0) {
    const label = document.createElement('span');
    label.className = 'section-label';
    label.textContent = 'Awaiting reply';
    section.appendChild(label);

    const pendingDiv = document.createElement('div');
    pendingDiv.className = 'flex flex-wrap gap-1';
    pending.forEach(id => {
      const chip = document.createElement('span');
      chip.className = 'text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full';
      chip.textContent = getDisplayName(id);
      pendingDiv.appendChild(chip);

      if (DEBUG_MODE) {
        const removeBtn = btn('×', 'ghost');
        removeBtn.className += ' text-xs py-0 px-1';
        removeBtn.onclick = () => {
          night.invited = night.invited.filter(uid => uid !== id);
          night.lastModified = Date.now();
          renderGameNights(nights, currentUser);
        };
        chip.appendChild(removeBtn);
      }
    });
    section.appendChild(pendingDiv);
  }

  wrapper.appendChild(section);
  return wrapper;
}

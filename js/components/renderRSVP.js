import { withdrawFromAllGames } from '../utils/index.js';
import { getCurrentUser } from '../auth/userStore.js';
import { saveGameNights } from '../data/index.js';
import { renderGameNights } from './renderGameNights.js';
import { sanitizeNight } from '../data/storage.js';
import { DEBUG_MODE } from '../config.js';

export function renderRSVP(night, nights) {
  const wrapper = document.createElement('div');
  const currentUser = getCurrentUser();

  if (!currentUser) return wrapper;

  const alreadyRSVPd = night.rsvps?.some(r => r.userId === currentUser.userId);

  // 📝 RSVP Button (only show if not RSVP'd yet)
  if (!alreadyRSVPd) {
    const rsvpBtn = document.createElement('button');
    rsvpBtn.textContent = 'RSVP';
    rsvpBtn.onclick = async () => {
      const name = prompt(`RSVP name for ${night.date}?`, currentUser.name || '');
      if (name?.trim()) {
        night.rsvps = Array.isArray(night.rsvps) ? night.rsvps : [];
        night.rsvps.push({ userId: currentUser.userId, name: name.trim() });
        night.lastModified = Date.now();
        sanitizeNight(night);
        await saveGameNights(nights);
        renderGameNights(nights, currentUser);
      }
    };
    wrapper.appendChild(rsvpBtn);
  }

  // 🧾 RSVP List with Cancel Option
  if (Array.isArray(night.rsvps) && night.rsvps.length > 0) {
    const list = document.createElement('ul');

    night.rsvps.forEach((rsvp, i) => {
      const item = document.createElement('li');
      item.textContent = `🎟️ ${rsvp.name}`;

      if (rsvp.userId === currentUser.userId) {
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel RSVP';
        cancelBtn.onclick = async () => {
          night.rsvps.splice(i, 1);
          withdrawFromAllGames(night, currentUser);
          night.lastModified = Date.now();
          sanitizeNight(night);
          await saveGameNights(nights);
          renderGameNights(nights, currentUser);
        };
        item.appendChild(cancelBtn);
      }

      list.appendChild(item);
    });

    wrapper.appendChild(list);
  }

  // ✉️ Invitee Display (only if any pending invites exist)
  const pendingInvites = (night.invited || []).filter(
    invitedUserId => !night.rsvps?.some(r => r.userId === invitedUserId)
  );

  if (pendingInvites.length > 0) {
    const inviteesBlock = document.createElement('div');
    inviteesBlock.className = 'invited-users';

    const label = document.createElement('strong');
    label.textContent = 'Invited (awaiting RSVP): ';
    inviteesBlock.appendChild(label);



    pendingInvites.forEach(invitedUserId => {
      const item = document.createElement('div');
      item.textContent = invitedUserId;

      if (DEBUG_MODE) {
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = () => {
          night.invited = night.invited.filter(uid => uid !== invitedUserId);
          night.lastModified = Date.now();
          renderGameNights(nights, currentUser);
        };
        item.appendChild(removeBtn);
      }

      inviteesBlock.appendChild(item);
    });


    wrapper.appendChild(inviteesBlock);
  }

  return wrapper;
}

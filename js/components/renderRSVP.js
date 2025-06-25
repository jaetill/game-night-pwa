import { syncAndRender } from '../utils/index.js';
import { getCurrentUser } from '../auth/auth.js';

export function renderRSVP(night, nights) {
  const wrapper = document.createElement('div');

  // 📝 RSVP Button
  // ✅ Show RSVP button only if user hasn't RSVP'd
  const alreadyRSVPd = night.rsvps?.some(r => r.userId === getCurrentUser().userId);
  if (!alreadyRSVPd) {
    const rsvpBtn = document.createElement('button');
    rsvpBtn.textContent = 'RSVP';
    rsvpBtn.onclick = () => {
      const name = prompt(`RSVP name for ${night.date}?`, getCurrentUser().name);
      if (name) {
        night.rsvps = night.rsvps || [];
        night.rsvps.push({ userId: getCurrentUser().userId, name: name.trim() });
        night.lastModified = Date.now();
        syncAndRender(nights);
      }
    };
    wrapper.appendChild(rsvpBtn);
  }

  // 🧾 RSVP List
  if (night.rsvps?.length) {
    const list = document.createElement('ul');
    night.rsvps.forEach((rsvp, i) => {
      const item = document.createElement('li');
      item.textContent = `🎟️ ${rsvp.name}`;
      if (rsvp.userId === getCurrentUser().userId) {
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel RSVP';
        cancelBtn.onclick = () => {
          night.rsvps.splice(i, 1);
          night.lastModified = Date.now();
          syncAndRender(nights);
        };
        item.appendChild(cancelBtn);
      }
      list.appendChild(item);
    });
    wrapper.appendChild(list);
  }

  return wrapper;
}

import { syncAndRender } from '../utils/sync.js';
import { currentUser } from '../data/state.js';

export function renderRSVP(night, nights) {
  const wrapper = document.createElement('div');

  // 📝 RSVP Button
  const rsvpBtn = document.createElement('button');
  rsvpBtn.textContent = 'RSVP';
  rsvpBtn.onclick = () => {
    const name = prompt(`RSVP name for ${night.date}?`, currentUser.name);
    if (name) {
      night.rsvps = night.rsvps || [];
      const already = night.rsvps.find(r => r.userId === currentUser.userId);
      if (!already) {
        night.rsvps.push({ userId: currentUser.userId, name: name.trim() });
        syncAndRender(nights);
      } else {
        alert("You've already RSVP'd.");
      }
    }
  };
  wrapper.appendChild(rsvpBtn);

  // 🧾 RSVP List
  if (night.rsvps?.length) {
    const list = document.createElement('ul');
    night.rsvps.forEach((rsvp, i) => {
      const item = document.createElement('li');
      item.textContent = `🎟️ ${rsvp.name}`;
      if (rsvp.userId === currentUser.userId) {
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel RSVP';
        cancelBtn.onclick = () => {
          night.rsvps.splice(i, 1);
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

// 🔐 Simulated Logged-In User (placeholder for future backend auth)
const currentUser = {
  userId: "user-123", // Later: replace with real auth ID
  name: "Jason"       // Or: prompt(), localStorage.getItem("name"), etc.
};

// 🌐 Admin Check
const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';
const schedulerSection = document.getElementById('schedulerSection');
if (isAdmin && schedulerSection) {
  schedulerSection.style.display = 'block';
}

// 🎯 DOM Elements
const scheduleForm = document.getElementById('scheduleForm');
const gameList = document.getElementById('gameList');

// 📦 LocalStorage Helpers
function loadGameNights() {
  const stored = localStorage.getItem('gameNights');
  return stored ? JSON.parse(stored) : [];
}

function saveGameNights(nights) {
  localStorage.setItem('gameNights', JSON.stringify(nights));
}

// 🧱 Game Night Builder
function createGameNight({ date, time }) {
  return {
    id: `event-${Date.now()}`,
    date,
    time,
    createdBy: currentUser.userId,
    repeat: 'none',
    notes: '',
    rsvps: []
  };
}

// 🖼️ Render Events + Actions
function renderGameNights(nights) {
  gameList.innerHTML = '';

  if (nights.length === 0) {
    gameList.innerHTML = '<li>No game nights scheduled.</li>';
    return;
  }

  nights
    .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
    .forEach(night => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>🎯 ${night.date} at ${night.time}</strong>`;

      // ✍️ RSVP Button
      const rsvpBtn = document.createElement('button');
      rsvpBtn.textContent = 'RSVP';
      rsvpBtn.onclick = () => {
        const name = prompt(`RSVP name for ${night.date}?`, currentUser.name);
        if (name) {
          night.rsvps = night.rsvps || [];

          // Check for existing RSVP by current user
          const alreadyRSVPed = night.rsvps.find(r => r.userId === currentUser.userId);
          if (!alreadyRSVPed) {
            night.rsvps.push({ userId: currentUser.userId, name: name.trim() });
            saveGameNights(nights);
            renderGameNights(nights);
          } else {
            alert("You've already RSVP'd for this night.");
          }
        }
      };
      li.appendChild(rsvpBtn);

      // 🗒️ RSVP List + Un-RSVP
      if (night.rsvps && night.rsvps.length > 0) {
        const rsvpList = document.createElement('ul');
        night.rsvps.forEach((rsvp, index) => {
          const guestItem = document.createElement('li');
          guestItem.textContent = `🎟️ ${rsvp.name}`;

          // 🎯 Only current user can cancel their own RSVP
          if (rsvp.userId === currentUser.userId) {
            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'Cancel RSVP';
            removeBtn.onclick = () => {
              night.rsvps.splice(index, 1);
              saveGameNights(nights);
              renderGameNights(nights);
            };
            guestItem.appendChild(removeBtn);
          }

          rsvpList.appendChild(guestItem);
        });
        li.appendChild(rsvpList);
      }

      // 🛡️ Admin: Edit + Cancel
      if (isAdmin) {
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => {
          document.getElementById('gameDate').value = night.date;
          document.getElementById('gameTime').value = night.time;
          const filtered = nights.filter(n => n.id !== night.id);
          saveGameNights(filtered);
          renderGameNights(filtered);
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel Event';
        cancelBtn.onclick = () => {
          const updated = nights.filter(n => n.id !== night.id);
          saveGameNights(updated);
          renderGameNights(updated);
        };

        li.appendChild(editBtn);
        li.appendChild(cancelBtn);
      }

      gameList.appendChild(li);
    });
}

// 📅 Schedule Form
if (scheduleForm) {
  scheduleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = document.getElementById('gameDate').value;
    const time = document.getElementById('gameTime').value;

    if (date && time) {
      const nights = loadGameNights();
      const newNight = createGameNight({ date, time });
      nights.push(newNight);
      saveGameNights(nights);
      renderGameNights(nights);
      scheduleForm.reset();
    }
  });
}

// 🚀 Initialize
renderGameNights(loadGameNights());

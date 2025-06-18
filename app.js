// 🌐 Admin Check
const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';
const schedulerSection = document.getElementById('schedulerSection');
if (isAdmin && schedulerSection) {
  schedulerSection.style.display = 'block';
}

// 📦 DOM Elements
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

// 🆕 Game Night Creator
function createGameNight({ date, time }) {
  return {
    id: `event-${Date.now()}`,
    date,
    time,
    createdBy: 'host',
    repeat: 'none',
    notes: '',
    rsvps: []
  };
}

// 📅 Render Game Nights
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
      li.textContent = `🎯 ${night.date} at ${night.time}`;

      // ✏️ Edit & Cancel (Admin Only)
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
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => {
          const updated = nights.filter(n => n.id !== night.id);
          saveGameNights(updated);
          renderGameNights(updated);
        };

        li.appendChild(editBtn);
        li.appendChild(cancelBtn);
      }

      // 🙋 RSVP (All Users)
      const rsvpBtn = document.createElement('button');
      rsvpBtn.textContent = 'RSVP';
      rsvpBtn.onclick = () => {
        const name = prompt(`Enter your name to RSVP for ${night.date} at ${night.time}`);
        if (name) {
          night.rsvps = night.rsvps || [];
          night.rsvps.push(name.trim());
          saveGameNights(nights);
          renderGameNights(nights);
        }
      };
      li.appendChild(rsvpBtn);

      // 🧾 RSVP List
      if (night.rsvps && night.rsvps.length > 0) {
        const rsvpList = document.createElement('ul');
        night.rsvps.forEach(name => {
          const guestItem = document.createElement('li');
          guestItem.textContent = `🎟️ ${name} is coming`;
          rsvpList.appendChild(guestItem);
        });
        li.appendChild(rsvpList);
      }

      gameList.appendChild(li);
    });
}

// 📝 Form Submit Handler
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

// 🔐 Simulated Logged-In User
const currentUser = {
  userId: "user-123",
  name: "Jason"
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
const uploadBtn = document.getElementById('uploadBtn');

// 📦 LocalStorage Helpers
function loadGameNights() {
  const stored = localStorage.getItem('gameNights');
  return stored ? JSON.parse(stored) : [];
}

function saveGameNights(nights) {
  localStorage.setItem('gameNights', JSON.stringify(nights));
}

// 🧱 Builder
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

// 🖼️ Renderer
function renderGameNights(nights) {
  gameList.innerHTML = '';

  if (!nights.length) {
    gameList.innerHTML = '<li>No game nights scheduled.</li>';
    return;
  }

  nights
    .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
    .forEach(night => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>🎯 ${night.date} at ${night.time}</strong>`;

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
      li.appendChild(rsvpBtn);

      if (night.rsvps?.length) {
        const rsvpList = document.createElement('ul');
        night.rsvps.forEach((rsvp, index) => {
          const guestItem = document.createElement('li');
          guestItem.textContent = `🎟️ ${rsvp.name}`;
          if (rsvp.userId === currentUser.userId) {
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel RSVP';
            cancelBtn.onclick = () => {
              night.rsvps.splice(index, 1);
              syncAndRender(nights);
            };
            guestItem.appendChild(cancelBtn);
          }
          rsvpList.appendChild(guestItem);
        });
        li.appendChild(rsvpList);
      }

      if (isAdmin) {
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => {
          document.getElementById('gameDate').value = night.date;
          document.getElementById('gameTime').value = night.time;
          const filtered = nights.filter(n => n.id !== night.id);
          syncAndRender(filtered);
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel Event';
        cancelBtn.onclick = () => {
          const updated = nights.filter(n => n.id !== night.id);
          syncAndRender(updated);
        };

        li.appendChild(editBtn);
        li.appendChild(cancelBtn);
      }

      gameList.appendChild(li);
    });
}

// 📅 Scheduler
if (scheduleForm) {
  scheduleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = document.getElementById('gameDate').value;
    const time = document.getElementById('gameTime').value;

    if (date && time) {
      const nights = loadGameNights();
      const newNight = createGameNight({ date, time });
      nights.push(newNight);
      syncAndRender(nights);
      scheduleForm.reset();
    }
  });
}

// ☁️ Save to S3
async function saveToCloud(gameNights) {
  try {
    const res = await fetch("https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod/upload-token");
    const { url, fields } = await res.json();

    const formData = new FormData();
    Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
    formData.append("file", new Blob([JSON.stringify(gameNights)], { type: "application/json" }));

    const upload = await fetch(url, { method: "POST", body: formData });

    if (!upload.ok) {
      const err = await upload.text();
      console.error("S3 upload failed:", err);
    }
  } catch (err) {
    console.error("Upload error:", err);
  }
}

// ☁️ Load from S3
async function loadFromCloud() {
  const res = await fetch("https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod/get-token");
  const { url } = await res.json();
  const dataRes = await fetch(url);
  return await dataRes.json();
}

// 🌀 Sync Utility
async function syncAndRender(nights) {
  saveGameNights(nights);
  renderGameNights(nights);
  await saveToCloud(nights);
}

// 🚀 Init
(async function () {
  try {
    const cloud = await loadFromCloud();
    syncAndRender(cloud);
    console.log("✅ Synced from cloud");
  } catch (e) {
    console.warn("⚠️ Cloud fetch failed. Falling back.");
    const local = loadGameNights();
    renderGameNights(local);
  }
})();

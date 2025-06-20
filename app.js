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
function createGameNight({ date, time, snacks }) {
  return {
    id: `event-${Date.now()}`,
    date,
    time,
    createdBy: currentUser.userId,
    repeat: 'none',
    notes: '',
	snacks,
    rsvps: [],
	suggestions: []
  };
}

// 🖼️ Renderer
function renderGameNights(nights) {
  gameList.innerHTML = '';
  gameList.className = 'game-list';

  if (!nights.length) {
    gameList.innerHTML = '<li>No game nights scheduled.</li>';
    return;
  }

  nights
    .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
    .forEach(night => {
      const li = document.createElement('div');
	  li.className = 'game-card'
      li.style.marginBottom = '1em';

      // 🧭 Minimal summary
      const summary = document.createElement('div');
      summary.innerHTML = `
        <strong>📅 ${night.date} @ ${night.time}</strong><br>
        👥 ${night.rsvps?.length || 0} attending
      `;

      // 🔽 Toggle button
      const toggleBtn = document.createElement('button');
      toggleBtn.textContent = 'Show Details ▾';

      // 🧩 Details block
      const detailsDiv = document.createElement('div');
      detailsDiv.style.display = 'none';
      detailsDiv.style.marginTop = '0.5em';

      // 🥨 Snacks
      if (night.snacks) {
        const snackP = document.createElement('p');
        snackP.textContent = `🥨 Snacks: ${night.snacks}`;
        detailsDiv.appendChild(snackP);
      }

      // ✍️ RSVP
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
      detailsDiv.appendChild(rsvpBtn);

      // 🎟️ RSVP List
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
        detailsDiv.appendChild(list);
      }

      // 🎲 Game Suggestions
      const suggestionInput = document.createElement('input');
      suggestionInput.placeholder = 'Suggest a game';
      suggestionInput.style.marginRight = '0.5em';

      const suggestBtn = document.createElement('button');
      suggestBtn.textContent = 'Suggest';
      suggestBtn.onclick = () => {
        const title = suggestionInput.value.trim();
        if (title) {
          night.suggestions = night.suggestions || [];
          night.suggestions.push({ title, suggestedBy: currentUser.name });
          syncAndRender(nights);
        }
      };

      detailsDiv.appendChild(document.createElement('br'));
      detailsDiv.appendChild(suggestionInput);
      detailsDiv.appendChild(suggestBtn);

      if (night.suggestions?.length) {
        const suggestionList = document.createElement('ul');
        night.suggestions.forEach(s =>
          suggestionList.innerHTML += `<li>🎲 ${s.title} <em>(suggested by ${s.suggestedBy})</em></li>`
        );
        detailsDiv.appendChild(suggestionList);
      }

      // 🛡️ Admin tools
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

        detailsDiv.appendChild(document.createElement('br'));
        detailsDiv.appendChild(editBtn);
        detailsDiv.appendChild(cancelBtn);
      }

      // 🔀 Toggle logic
      toggleBtn.onclick = () => {
        const isOpen = detailsDiv.style.display === 'block';
        detailsDiv.style.display = isOpen ? 'none' : 'block';
        toggleBtn.textContent = isOpen ? 'Show Details ▾' : 'Hide Details ▴';
      };

      li.appendChild(summary);
      li.appendChild(toggleBtn);
      li.appendChild(detailsDiv);
      gameList.appendChild(li);
    });
}

// 📅 Scheduler
if (scheduleForm) {
  scheduleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = document.getElementById('gameDate').value;
    const time = document.getElementById('gameTime').value;
	const snacks = document.getElementById('snackNotes').value;

    if (date && time) {
      const nights = loadGameNights();
      const newNight = createGameNight({ date, time, snacks });
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

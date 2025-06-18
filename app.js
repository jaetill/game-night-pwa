const form = document.getElementById('rsvpForm');
const guestList = document.getElementById('guestList');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const guestName = document.getElementById('guestName').value.trim();
  if (guestName) {
    const listItem = document.createElement('li');
    listItem.textContent = guestName + ' is coming! 🎉';
    guestList.appendChild(listItem);
    form.reset();
  }
})

const schedulerSection = document.getElementById('schedulerSection');
// For example, only show the form if the user visits with ?admin=true
const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';

if (isAdmin) {
  schedulerSection.style.display = 'block';
}

const scheduleForm = document.getElementById('scheduleForm');
const gameList = document.getElementById('gameList');

function loadGameNights() {
  const stored = localStorage.getItem('gameNights');
  return stored ? JSON.parse(stored) : [];
}

function saveGameNights(nights) {
  localStorage.setItem('gameNights', JSON.stringify(nights));
}

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

      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.onclick = () => {
        const updated = nights.filter(n => n.id !== night.id);
        saveGameNights(updated);
        renderGameNights(updated);
      };

      // Edit button
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => {
        document.getElementById('gameDate').value = night.date;
        document.getElementById('gameTime').value = night.time;

        const filtered = nights.filter(n => n.id !== night.id);
        saveGameNights(filtered);
        renderGameNights(filtered);
      };

	// RSVP button
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

      li.appendChild(editBtn);
      li.appendChild(cancelBtn);
	  li.appendChild(rsvpBtn)
      gameList.appendChild(li);
    });
}


// On submit: add a new game night
function createGameNight({ date, time }) {
  return {
    id: `event-${Date.now()}`,
    date,
    time,
    createdBy: "host",
    repeat: "none",
    notes: "",
	rsvps: []
  };
}

scheduleForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const date = document.getElementById("gameDate").value;
  const time = document.getElementById("gameTime").value;

  if (date && time) {
    const nights = loadGameNights();
    const newNight = createGameNight({ date, time });
    nights.push(newNight);
    saveGameNights(nights);
    renderGameNights(nights);
    scheduleForm.reset();
  }
});


// Initialize on page load
renderGameNights(loadGameNights());


const clearButton = document.getElementById('clearSchedule');

clearButton.addEventListener('click', () => {
  localStorage.removeItem('nextGameNight');
  nextGame.textContent = '🎯 No game night scheduled.';
});

// Show stored schedule on page load
const storedGameNight = localStorage.getItem('nextGameNight');
if (storedGameNight) {
  nextGame.textContent = `🎯 Next Game Night: ${storedGameNight}`;
};
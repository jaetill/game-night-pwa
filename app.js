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
const nextGame = document.getElementById('nextGame');

scheduleForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const date = document.getElementById('gameDate').value;
  const time = document.getElementById('gameTime').value;
  
  if (date && time) {
    const gameNight = `${date} at ${time}`;
    localStorage.setItem('nextGameNight', gameNight);
    nextGame.textContent = `🎯 Next Game Night: ${gameNight}`;
    scheduleForm.reset();
  }
});

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
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
});
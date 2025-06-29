export function renderGlobalHostPanel() {
  let scheduler = document.getElementById('schedulerSection');
  if (!scheduler) {
    scheduler = document.createElement('section');
    scheduler.id = 'schedulerSection';
    document.getElementById('app')?.appendChild(scheduler);
  }

  scheduler.innerHTML = ''; // or custom layout
  scheduler.style.display = 'block';

  const createBtn = document.createElement('button');
  createBtn.textContent = '🗓️ Create Game Night';
  createBtn.onclick = () => {
    renderGameNightForm({
      onSave: async newNight => {
        const nights = await loadGameNights();
        nights.push(newNight);
        await saveGameNights(nights);
        renderGameNights(nights, getCurrentUser());
      }
    });
  };


  scheduler.appendChild(createBtn);
}

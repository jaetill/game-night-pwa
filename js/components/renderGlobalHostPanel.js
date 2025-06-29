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
    // invoke your modal or form logic
  };

  scheduler.appendChild(createBtn);
}

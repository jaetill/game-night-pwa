// js/components/renderGlobalAdminPanel.js

export function renderGlobalAdminPanel() {
  const scheduler = document.getElementById('schedulerSection');
  if (!scheduler) {
    console.warn('No #schedulerSection found in the DOM.');
    return;
  }
  scheduler.style.display = 'block';
}

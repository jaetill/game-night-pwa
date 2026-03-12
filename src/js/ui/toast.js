const ICONS = { success: '✓', error: '✕', info: 'ℹ' };
const DURATION = 3500;

export function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast toast-${type} pointer-events-auto`;
  el.innerHTML = `
    <span class="font-bold text-base leading-none mt-0.5">${ICONS[type]}</span>
    <span>${message}</span>
  `;

  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, DURATION);
}

export const toastSuccess = msg => toast(msg, 'success');
export const toastError   = msg => toast(msg, 'error');
export const toastInfo    = msg => toast(msg, 'info');

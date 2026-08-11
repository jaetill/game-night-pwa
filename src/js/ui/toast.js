const ICONS = { success: '✓', error: '✕', info: 'ℹ' };
const DURATION = 3500;

export function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast toast-${type} pointer-events-auto`;

  // textContent, not innerHTML — messages interpolate user-typed strings
  // (e.g. invite email addresses) and must never be parsed as HTML.
  const icon = document.createElement('span');
  icon.className = 'font-bold text-base leading-none mt-0.5';
  icon.textContent = ICONS[type];

  const text = document.createElement('span');
  text.textContent = message;

  el.appendChild(icon);
  el.appendChild(text);

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

/**
 * Shared DOM element factory helpers.
 * Keep components DRY and styling consistent.
 */

export function btn(label, variant = 'primary', onClick) {
  const el = document.createElement('button');
  el.className = `btn btn-${variant}`;
  el.textContent = label;
  if (onClick) el.onclick = onClick;
  return el;
}

export function badge(label, variant = 'maybe') {
  const el = document.createElement('span');
  el.className = `badge badge-${variant}`;
  el.textContent = label;
  return el;
}

export function input(placeholder, value = '', extraClass = '') {
  const el = document.createElement('input');
  el.className = `field ${extraClass}`.trim();
  el.placeholder = placeholder;
  el.value = value;
  return el;
}

export function div(...classes) {
  const el = document.createElement('div');
  el.className = classes.join(' ');
  return el;
}

export function formatDate(dateStr, timeStr) {
  // Missing time (e.g. events created via the MCP server) must not produce
  // an Invalid Date — fall back to midnight for the date and show no time.
  const d = new Date(`${dateStr}T${timeStr || '00:00'}`);
  if (Number.isNaN(d.getTime())) {
    return { day: dateStr || '', time: timeStr || '' };
  }
  const day  = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const time = timeStr ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  return { day, time };
}

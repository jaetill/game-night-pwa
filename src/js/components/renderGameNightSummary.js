import { getDisplayName } from '../utils/userDirectory.js';
import { badge, formatDate } from '../ui/elements.js';
import { attendingGuests, pendingGuests, declinedGuests, isAttending, hasDeclined, isPending } from '../data/guests.js';

// Safe HTML escape for inline interpolation. Never use innerHTML with raw
// user-supplied strings (location, host display name, description). Routes
// that already use textContent or DOM append don't need this.
function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = String(s ?? '');
  return div.innerHTML;
}

export function renderGameNightSummary(night, currentUser) {
  const { day, time } = formatDate(night.date, night.time);

  const guests = Array.isArray(night.guests) ? night.guests : [];

  const attendingCount = attendingGuests(guests).length;
  const pendingCount   = pendingGuests(guests).length;
  const declinedCount  = declinedGuests(guests).length;

  const summary = document.createElement('div');

  // Date + time row
  const dateRow = document.createElement('div');
  dateRow.className = 'flex items-start justify-between gap-2';

  const canSeeLocation = currentUser && (
    night.hostUserId === currentUser.userId ||
    isAttending(guests, currentUser.userId)
  );

  const dateText = document.createElement('div');
  const locationStr = canSeeLocation && night.location
    ? ` · ${escapeHtml(night.location.replace(/\n+/g, ', '))}`
    : '';
  dateText.innerHTML = `<p class="font-semibold text-gray-900">${escapeHtml(day)}</p>
    <p class="text-sm text-gray-500">${escapeHtml(time)}${locationStr}</p>`;
  dateRow.appendChild(dateText);

  // Current user's own status badge
  if (currentUser) {
    const uid = currentUser.userId;
    let statusBadge = null;
    if (night.hostUserId === uid) {
      statusBadge = badge('Host', 'host');
    } else if (isAttending(guests, uid)) {
      statusBadge = badge('Going ✓', 'going');
    } else if (hasDeclined(guests, uid)) {
      statusBadge = badge('Declined', 'out');
    } else if (isPending(guests, uid)) {
      statusBadge = badge('Invited', 'maybe');
    }
    if (statusBadge) {
      statusBadge.className += ' shrink-0 mt-0.5';
      dateRow.appendChild(statusBadge);
    }
  }

  summary.appendChild(dateRow);

  // Stats row
  const stats = document.createElement('div');
  stats.className = 'flex items-center gap-3 mt-2 text-xs text-gray-500';
  stats.innerHTML = `
    <span>👤 ${escapeHtml(getDisplayName(night.hostUserId))}</span>
    <span>·</span>
    <span>🎟 ${attendingCount} going</span>
    ${pendingCount > 0 ? `<span>· ${pendingCount} pending</span>` : ''}
    ${declinedCount > 0 ? `<span>· ${declinedCount} can't make it</span>` : ''}
  `;
  summary.appendChild(stats);

  return summary;
}

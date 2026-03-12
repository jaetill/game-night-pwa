import { getDisplayName } from '../utils/userDirectory.js';
import { badge, formatDate } from '../ui/elements.js';

export function renderGameNightSummary(night, currentUser) {
  const { day, time } = formatDate(night.date, night.time);

  const rsvps    = Array.isArray(night.rsvps)    ? night.rsvps    : [];
  const declined = Array.isArray(night.declined) ? night.declined : [];
  const invited  = Array.isArray(night.invited)  ? night.invited  : [];

  const hostDeclined  = declined.includes(night.hostUserId);
  const attendingCount = rsvps.length + (night.hostUserId && !hostDeclined ? 1 : 0);
  const pendingCount   = invited.filter(
    uid => !rsvps.some(r => r.userId === uid) && !declined.includes(uid)
  ).length;

  const summary = document.createElement('div');

  // Date + time row
  const dateRow = document.createElement('div');
  dateRow.className = 'flex items-start justify-between gap-2';

  const dateText = document.createElement('div');
  dateText.innerHTML = `<p class="font-semibold text-gray-900">${day}</p>
    <p class="text-sm text-gray-500">${time}${night.location ? ` · ${night.location}` : ''}</p>`;
  dateRow.appendChild(dateText);

  // Current user's own status badge
  if (currentUser) {
    const uid = currentUser.userId;
    let statusBadge = null;
    if (night.hostUserId === uid) {
      statusBadge = badge('Host', 'host');
    } else if (rsvps.some(r => r.userId === uid)) {
      statusBadge = badge('Going ✓', 'going');
    } else if (declined.includes(uid)) {
      statusBadge = badge('Declined', 'out');
    } else if (invited.includes(uid)) {
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
    <span>👤 ${getDisplayName(night.hostUserId)}</span>
    <span>·</span>
    <span>🎟 ${attendingCount} going</span>
    ${pendingCount > 0 ? `<span>· ${pendingCount} pending</span>` : ''}
  `;
  summary.appendChild(stats);

  return summary;
}

export function renderGameNightSummary(night) {
  const summary = document.createElement('div');
  summary.className = 'night-summary';

  // 🗓️ Date and Time
  const dateLine = document.createElement('div');
  dateLine.textContent = `📅 ${night.date} @ ${night.time}`;
  summary.appendChild(dateLine);

  // 🙋 Host Info
  const hostLine = document.createElement('div');
  hostLine.textContent = `Host: ${night.hostUserId}`;
  summary.appendChild(hostLine);

  // 📊 RSVP Breakdown
  const rsvps = Array.isArray(night.rsvps) ? night.rsvps : [];
  const declined = Array.isArray(night.declined) ? night.declined : [];
  const invited = Array.isArray(night.invited) ? night.invited : [];

  const hostId = night.hostUserId;
  const hostDeclined = declined.includes(hostId);
  const includeHost = hostId && !hostDeclined;

  const attendingCount = rsvps.length + (includeHost ? 1 : 0);
  const declineCount = declined.length;

  const pendingCount = invited.filter(
    uid =>
      !rsvps.some(r => r.userId === uid) &&
      !declined.includes(uid)
  ).length;

  const rsvpLine = document.createElement('div');
  rsvpLine.textContent = `${attendingCount} attending · ${declineCount} not attending · ${pendingCount} invited`;
  summary.appendChild(rsvpLine);

  return summary;
}

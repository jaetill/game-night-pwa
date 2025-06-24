export function renderGameNightSummary(night) {
  const summary = document.createElement('div');
  summary.innerHTML = `
    <strong>📅 ${night.date} @ ${night.time}</strong><br>
    👥 ${night.rsvps?.length || 0} attending
  `;
  return summary;
}

// lib/ics.js — build an iCalendar (.ics) attachment for invite/nudge emails.
//
// Times are written as RFC 5545 "floating" local times (no TZID, no Z) —
// calendar apps interpret them in the viewer's local zone, which is the
// right behavior for an in-person event where everyone is in the host's
// city anyway. If `time` can't be parsed, falls back to an all-day event.
//
// Returns the ICS text, or null when the night has no parseable date.

'use strict';

// Accepts '19:00', '7pm', '7:30 PM', '7.30pm' etc. Returns {h, m} or null.
function parseTime(str) {
  if (typeof str !== 'string') return null;
  const m = str.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?m?\.?$/i)
         || str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3] ? m[3].toLowerCase() : null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

// RFC 5545 text escaping: backslash, semicolon, comma, newline.
function escapeIcsText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Fold lines longer than 75 octets (simple char-based fold; our content is
// effectively ASCII-plus-emoji and slight overcounting is harmless).
function foldLine(line) {
  if (line.length <= 74) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join('\r\n');
}

function pad(n) { return String(n).padStart(2, '0'); }

function fmtLocal(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

/**
 * Build an ICS document for a game night.
 * @param {object} night   — { id, date: 'YYYY-MM-DD', time?, location?, description? }
 * @param {object} opts    — { hostName?, appUrl?, durationHours? (default 3), now? (Date, test seam) }
 */
function buildIcs(night, opts = {}) {
  const { id, date, time, location, description } = night || {};
  if (!id || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const { hostName, appUrl, durationHours = 3, now = new Date() } = opts;
  const t = parseTime(time);
  const compactDate = date.replace(/-/g, '');

  let dtLines;
  if (t) {
    const [y, mo, d] = date.split('-').map(Number);
    const start = new Date(y, mo - 1, d, t.h, t.m, 0);
    const end   = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
    dtLines = [`DTSTART:${fmtLocal(start)}`, `DTEND:${fmtLocal(end)}`];
  } else {
    const [y, mo, d] = date.split('-').map(Number);
    const next = new Date(y, mo - 1, d + 1);
    const nextCompact = `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
    dtLines = [`DTSTART;VALUE=DATE:${compactDate}`, `DTEND;VALUE=DATE:${nextCompact}`];
  }

  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const summary = hostName ? `Game night at ${hostName}'s` : 'Game night';
  const descParts = [];
  if (description) descParts.push(description);
  if (appUrl) descParts.push(`RSVP and game sign-up: ${appUrl}`);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//jaetill//game-night-pwa//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(String(id))}@gamenights.jaetill.com`,
    `DTSTAMP:${dtstamp}`,
    ...dtLines,
    `SUMMARY:${escapeIcsText(summary)}`,
    ...(location ? [`LOCATION:${escapeIcsText(location)}`] : []),
    ...(descParts.length ? [`DESCRIPTION:${escapeIcsText(descParts.join('\n\n'))}`] : []),
    ...(appUrl ? [`URL:${escapeIcsText(appUrl)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

module.exports = { buildIcs, _parseTime: parseTime, _escapeIcsText: escapeIcsText };

import { API_BASE } from '../config.js';
import { findGuest, newGuest, removeGuests } from '../data/guests.js';

import { authFetch } from './authFetch.js';
import { getDisplayName } from './userDirectory.js';

/**
 * Invite via POST /invite (nudgeNonResponders Lambda). `value` is either an
 * email address (Invite box, Saved groups) or a Cognito userId (Recent
 * guests checkboxes — the Lambda resolves the email itself).
 *
 * ADR-0021: the Lambda is the canonical writer of the guest entry — it
 * provisions the account, resolves the userId, and writes the entry to S3
 * under an ETag. It returns that entry, and we adopt it locally (replacing
 * the placeholder we showed while the call was in flight) so the client and
 * server agree on the entry's id. Failures are logged, not surfaced — the
 * placeholder stays on the list and the email is best-effort.
 */
export function sendInviteEmail(night, value) {
  const payload = value.includes('@')
    ? { nightId: night.id, action: 'invite', email: value }
    : { nightId: night.id, action: 'invite', userId: value };
  return authFetch(`${API_BASE}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(async res => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('Invite email failed:', value, data.error || res.status);
      return null;
    }
    if (data.guest) adoptServerGuest(night, data.guest);
    return data.guest || null;
  }).catch(e => console.warn('Invite email error:', value, e.message));
}

/**
 * Bring the local copy in line with the server's entry for this person.
 * Same id → copy the resolved fields onto it. Different id (the Lambda
 * created the entry before our placeholder reached S3) → replace ours with
 * the server's so the two sides agree on the entry's identity from now on.
 */
function adoptServerGuest(night, serverGuest) {
  const g = newGuest(serverGuest);
  const sameId = night.guests.find(x => x.id === g.id);
  if (sameId) {
    if (g.userId && !sameId.userId) sameId.userId = g.userId;
    if (g.email  && !sameId.email)  sameId.email  = g.email;
    if (g.name   && !sameId.name)   sameId.name   = g.name;
    return;
  }
  const local = findGuest(night.guests, { userId: g.userId, email: g.email });
  if (local) removeGuests(night, x => x.id === local.id);
  night.guests.push(g);
}

/** Add a pending placeholder entry for an email or userId; false if already present. */
export function addPlaceholder(night, value, invitedBy) {
  const isEmail = value.includes('@');
  const existing = findGuest(night.guests, isEmail ? { email: value } : { userId: value });
  if (existing) return false;
  night.guests.push(newGuest(isEmail
    ? { email: value, invitedBy }
    : { userId: value, name: getDisplayName(value) !== value ? getDisplayName(value) : null, invitedBy }));
  return true;
}


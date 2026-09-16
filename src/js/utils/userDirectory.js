import { getCurrentUser } from '../auth/userStore.js';

// Built from the guest lists of loaded game nights (ADR-0021).
//   directory:     userId → display name
//   emailToUserId: email (lowercase) → userId
//
// Guest entries carry both a userId (once resolved) and the email the invite
// went to, so one pass over night.guests[] gives both maps. The email map is
// what lets "Saved groups" recognise that a group email is already on a
// night under that person's userId.
const directory     = new Map();
const emailToUserId = new Map();

/**
 * Populates the in-memory directory from guest entries found in game
 * nights. Call this after loading nights on app init.
 */
export function buildDirectoryFromNights(nights) {
  for (const night of nights) {
    for (const g of night.guests || []) {
      if (g.userId && g.name) directory.set(g.userId, g.name);
      if (g.userId && typeof g.email === 'string' && g.email.includes('@')) {
        emailToUserId.set(g.email.toLowerCase(), g.userId);
      }
    }
  }
}

/**
 * Collapses an invite key (email or userId) to the userId when the email is
 * known to belong to a signed-in user; otherwise returns the key unchanged.
 */
export function resolveGuestKey(emailOrId) {
  if (typeof emailOrId !== 'string') return emailOrId;
  return emailToUserId.get(emailOrId.toLowerCase()) || emailOrId;
}

/**
 * Returns the best available display name for a given userId or email.
 * Checks the current user, then the directory built from guest history
 * (an email resolves through to its user's name when known).
 * Falls back to the raw value (userId or email) if unknown.
 */
export function getDisplayName(userIdOrEmail) {
  const current = getCurrentUser();
  if (current?.userId === userIdOrEmail) return current.name || userIdOrEmail;
  const key = resolveGuestKey(userIdOrEmail);
  return directory.get(key) || userIdOrEmail;
}

/**
 * Display label for a guest entry: cached name, else the directory's name
 * for the userId, else the email, else "<sponsor>'s guest" for an
 * anonymous plus-one.
 */
export function guestLabel(g) {
  if (!g) return '';
  if (g.name) return g.name;
  if (g.userId) return getDisplayName(g.userId);
  if (g.email) return g.email;
  const sponsor = g.invitedBy ? getDisplayName(g.invitedBy) : 'Someone';
  return `${sponsor}'s guest`;
}

/** Test seam — clears both maps. */
export function _resetDirectoryForTest() {
  directory.clear();
  emailToUserId.clear();
}

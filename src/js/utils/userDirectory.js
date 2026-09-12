import { getCurrentUser } from '../auth/userStore.js';

// Built from RSVP data in loaded game nights.
//   directory:     userId → display name
//   emailToUserId: email (lowercase) → userId
//
// The email map is what lets "Recent guests" show one entry per person.
// An invite is stored as an email in night.invited[]; once that person signs
// in and RSVPs they appear as a Cognito userId in night.rsvps[]. Without a
// mapping the two look like different people. RSVP entries written since
// PR #367 carry `email`, and older ones were backfilled from Cognito.
const directory     = new Map();
const emailToUserId = new Map();

/**
 * Populates the in-memory directory from userId/name/email found in game
 * nights. Call this after loading nights on app init.
 */
export function buildDirectoryFromNights(nights) {
  for (const night of nights) {
    for (const rsvp of night.rsvps || []) {
      if (rsvp.userId && rsvp.name) directory.set(rsvp.userId, rsvp.name);
      if (rsvp.userId && typeof rsvp.email === 'string' && rsvp.email.includes('@')) {
        emailToUserId.set(rsvp.email.toLowerCase(), rsvp.userId);
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
 * Checks the current user, then the directory built from RSVP history
 * (an email resolves through to its user's name when known).
 * Falls back to the raw value (userId or email) if unknown.
 */
export function getDisplayName(userIdOrEmail) {
  const current = getCurrentUser();
  if (current?.userId === userIdOrEmail) return current.name || userIdOrEmail;
  const key = resolveGuestKey(userIdOrEmail);
  return directory.get(key) || userIdOrEmail;
}

/** Test seam — clears both maps. */
export function _resetDirectoryForTest() {
  directory.clear();
  emailToUserId.clear();
}

import { getCurrentUser } from '../auth/userStore.js';

// Built from RSVP data in loaded game nights — userId → display name
const directory = new Map();

/**
 * Populates the in-memory directory from userId/name pairs found in game nights.
 * Call this after loading nights on app init.
 */
export function buildDirectoryFromNights(nights) {
  for (const night of nights) {
    for (const rsvp of night.rsvps || []) {
      if (rsvp.userId && rsvp.name) directory.set(rsvp.userId, rsvp.name);
    }
  }
}

/**
 * Returns the best available display name for a given userId or email.
 * Checks the current user, then the directory built from RSVP history.
 * Falls back to the raw value (userId or email) if unknown.
 */
export function getDisplayName(userIdOrEmail) {
  const current = getCurrentUser();
  if (current?.userId === userIdOrEmail) return current.name || userIdOrEmail;
  return directory.get(userIdOrEmail) || userIdOrEmail;
}

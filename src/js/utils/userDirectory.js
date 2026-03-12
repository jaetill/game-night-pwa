import { getCurrentUser } from '../auth/userStore.js';

/**
 * Returns the best available display name for a given userId.
 * Checks the currently logged-in user first, then falls back to the userId itself.
 * Future: could look up a shared profiles store fetched from S3.
 */
export function getDisplayName(userId) {
  const current = getCurrentUser();
  if (current?.userId === userId) return current.name || userId;
  return userId;
}

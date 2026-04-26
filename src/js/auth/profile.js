import { parseIdToken } from '../auth.js';
import { getCurrentUser, setCurrentUser } from './userStore.js';
import { authFetch } from '../utils/authFetch.js';

const PROFILE_KEY = 'userProfile';
const API_BASE    = 'https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod';

/** Returns the locally-cached profile for the current user. */
export function getProfile() {
  const stored = localStorage.getItem(PROFILE_KEY);
  return stored ? JSON.parse(stored) : {};
}

function persistLocally(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  const user = getCurrentUser();
  if (user) setCurrentUser({ ...user, bggUsername: profile.bggUsername || '' });
}

/** Loads profile from S3 (authoritative), falls back to JWT claims, then localStorage. */
export async function loadProfile() {
  try {
    const res = await authFetch(`${API_BASE}/profiles`);
    if (res.ok) {
      const remote = await res.json();
      if (remote && Object.keys(remote).length > 0) {
        persistLocally(remote);
        return remote;
      }
    }
  } catch {
    // fall through to JWT claims / localStorage
  }

  // Seed from JWT claims, merged with any existing localStorage values
  const existing = getProfile();
  const claims   = parseIdToken() || {};
  const profile  = {
    displayName:  claims.name                  || existing.displayName  || '',
    bggUsername:  claims['custom:bggUsername'] || existing.bggUsername  || '',
    contactEmail: claims.email                 || existing.contactEmail || '',
    phone:        claims.phone_number          || existing.phone        || '',
    address:      existing.address             || '',
  };
  persistLocally(profile);
  return profile;
}

/** Saves profile to S3 + localStorage.
 *  TODO: Cognito attribute sync (was Auth.updateUserAttributes pre-migration).
 *  Call cognito-idp:UpdateUserAttributes directly with the access token if needed —
 *  not critical for app function since profile data lives primarily in S3. */
export async function saveProfile(profile) {
  persistLocally(profile);

  try {
    await authFetch(`${API_BASE}/profiles`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(profile),
    });
  } catch (err) {
    console.warn('Profile: S3 save failed:', err.message);
  }
}

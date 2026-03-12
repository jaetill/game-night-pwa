import { Auth } from 'aws-amplify';
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

/** Loads profile from S3 (authoritative), falls back to Cognito attrs, then localStorage. */
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
    // fall through to Cognito / localStorage
  }

  // Seed from Cognito attributes if S3 has nothing yet
  try {
    const info  = await Auth.currentUserInfo();
    const attrs = info.attributes || {};
    const profile = {
      displayName:  attrs.name                    || '',
      bggUsername:  attrs['custom:bggUsername']   || getProfile().bggUsername || '',
      contactEmail: attrs.email                   || '',
      phone:        attrs.phone_number            || '',
      address:      getProfile().address          || '',
    };
    persistLocally(profile);
    return profile;
  } catch {
    return getProfile();
  }
}

/** Saves profile to S3, localStorage, and syncs select fields to Cognito. */
export async function saveProfile(profile) {
  persistLocally(profile);

  // Save to S3 (primary store)
  try {
    await authFetch(`${API_BASE}/profiles`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(profile),
    });
  } catch (err) {
    console.warn('Profile: S3 save failed:', err.message);
  }

  // Sync name/email/phone to Cognito for auth-layer consistency
  try {
    const cognitoUser = await Auth.currentAuthenticatedUser();
    const updates = {};
    if (profile.displayName)  updates.name                  = profile.displayName;
    if (profile.contactEmail) updates.email                 = profile.contactEmail;
    if (profile.bggUsername)  updates['custom:bggUsername'] = profile.bggUsername;
    if (profile.phone && /^\+\d{7,15}$/.test(profile.phone)) {
      updates.phone_number = profile.phone;
    }
    if (Object.keys(updates).length) {
      await Auth.updateUserAttributes(cognitoUser, updates);
    }
  } catch (err) {
    console.warn('Profile: Cognito sync skipped:', err.message);
  }
}

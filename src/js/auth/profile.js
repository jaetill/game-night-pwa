import { Auth } from 'aws-amplify';
import { getCurrentUser, setCurrentUser } from './userStore.js';

const PROFILE_KEY = 'userProfile';

/** Returns the locally-stored profile for the current user. */
export function getProfile() {
  const stored = localStorage.getItem(PROFILE_KEY);
  return stored ? JSON.parse(stored) : {};
}

function persistLocally(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  const user = getCurrentUser();
  if (user) setCurrentUser({ ...user, bggUsername: profile.bggUsername || '' });
}

/** Loads profile from Cognito attributes and syncs to localStorage. */
export async function loadProfile() {
  try {
    const info = await Auth.currentUserInfo();
    const attrs = info.attributes || {};
    const profile = {
      displayName:  attrs.name || '',
      bggUsername:  attrs['custom:bggUsername'] || getProfile().bggUsername || '',
      contactEmail: attrs.email || '',
      phone:        attrs.phone_number || '',
    };
    persistLocally(profile);
    return profile;
  } catch {
    return getProfile();
  }
}

/**
 * Saves profile to localStorage and attempts to sync standard fields to Cognito.
 * BGG username is stored locally only until the Cognito custom attribute is configured.
 */
export async function saveProfile(profile) {
  persistLocally(profile);
  try {
    const cognitoUser = await Auth.currentAuthenticatedUser();
    const updates = {};
    if (profile.displayName)  updates.name         = profile.displayName;
    if (profile.contactEmail) updates.email        = profile.contactEmail;
    if (profile.phone)        updates.phone_number = profile.phone;
    if (profile.bggUsername) updates['custom:bggUsername'] = profile.bggUsername;
    if (Object.keys(updates).length) {
      await Auth.updateUserAttributes(cognitoUser, updates);
    }
  } catch (err) {
    console.warn('Profile: Cognito sync skipped:', err.message);
  }
}

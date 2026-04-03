import { authFetch } from '../utils/authFetch.js';

const API_BASE = 'https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod';
const CACHE_KEY = 'userGroups';

/** Returns cached groups array from localStorage. */
export function getGroups() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
  } catch {
    return [];
  }
}

function cacheGroups(groups) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(groups));
}

/** Loads groups from the API, caches locally, and returns them. */
export async function loadGroups() {
  try {
    const res = await authFetch(`${API_BASE}/groups`);
    if (res.ok) {
      const data = await res.json();
      const groups = data.groups || [];
      cacheGroups(groups);
      return groups;
    }
  } catch (e) {
    console.warn('Groups: load failed:', e.message);
  }
  return getGroups();
}

/** Creates or updates a group. Returns the updated groups array. */
export async function saveGroup(name, emails) {
  const res = await authFetch(`${API_BASE}/groups`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, emails }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  cacheGroups(data.groups);
  return data.groups;
}

/** Deletes a group by name. Returns the updated groups array. */
export async function deleteGroup(name) {
  const res = await authFetch(`${API_BASE}/groups`, {
    method:  'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  cacheGroups(data.groups);
  return data.groups;
}

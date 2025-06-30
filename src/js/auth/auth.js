import { getCurrentUser as getUserFromStore } from './userStore.js';
import { isHost } from './permissions.js';

export function getCurrentUser() {
  // fallback to dev user if none saved
  return (
    getUserFromStore() || {
      userId: 'dev_jaetill',
      name: 'Jason (Dev)',
    }
  );
}

// Temporary compatibility layer
export const isAdmin = (...args) => isHost(...args);

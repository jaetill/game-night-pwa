const USER_KEY = 'currentUser';

export function getCurrentUser() {
  const stored = localStorage.getItem(USER_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function setCurrentUser(userObj) {
  if (!userObj || !userObj.userId) {
    console.warn('Invalid user object');
    return;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(userObj));
}

export function clearCurrentUser() {
  localStorage.removeItem(USER_KEY);
}

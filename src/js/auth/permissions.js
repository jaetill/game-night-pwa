export function isHost(user, night) {
  return user?.userId && night?.hostUserId === user.userId;
}
// This function checks if the current user is the host of the game night
// It returns true if the user is the host, otherwise false

export function getUserNightRole(night, user) {
  if (!user || !user.userId) return null;
  if (night.hostUserId === user.userId) return 'Host';
  if (night.rsvps?.some(r => r.userId === user.userId)) return 'RSVP’d';
  if (night.invited?.includes(user.userId)) return 'Invited';
  return null;
}


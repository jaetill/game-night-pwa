export function isHost(user, night) {
  return !!user?.userId && night?.hostUserId === user.userId;
}
// This function checks if the current user is the host of the game night
// It returns true if the user is the host, otherwise false

export function getUserNightRole(night, user) {
  if (!user || !user.userId) return null;
  if (night.hostUserId === user.userId) return 'Host';
  const me = (night.guests || []).find(g => g.userId === user.userId);
  if (!me) return null;
  if (me.response && me.response.type !== 'declined') return 'RSVP’d';
  if (!me.response) return 'Invited';
  return null;
}


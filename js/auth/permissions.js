export function isHost(user, night) {
  return user?.userId && night?.hostUserId === user.userId;
}
// This function checks if the current user is the host of the game night
// It returns true if the user is the host, otherwise false



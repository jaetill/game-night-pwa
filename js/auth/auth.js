// Temporary hardcoded user for testing
export const currentUser = {
  userId: 'jaetill',
  name: 'Jason',
  role: localStorage.getItem('devRole') || 'admin' // or 'guest'
};
// This object represents the current user with a hardcoded userId, name, and role
// It retrieves the role from localStorage for development purposes
// This file contains authentication-related functions and the current user object


// Dev-friendly admin check
export function isAdmin(user) {
  return user?.role === 'admin';
}
// This function checks if the current user is an admin based on their role
// It returns true if the user is an admin, otherwise false

// Temporary hardcoded user for testing
export function getCurrentUser() {
  return {
    userId: localStorage.getItem('userId') || 'jaetill',
    name: localStorage.getItem('userName') || 'Jason',
    role: localStorage.getItem('devRole') || 'admin'
  };
}
// This module provides authentication-related functions and the current user object
// It includes a function to get the current user and a check for admin status



// Dev-friendly admin check
export function isAdmin(user) {
  return user?.role === 'admin';
}
// This function checks if the current user is an admin based on their role
// It returns true if the user is an admin, otherwise false

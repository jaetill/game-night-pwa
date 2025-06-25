// This module handles user authentication and role management
// It provides a mock user object for development purposes and includes a function to check admin status


// This module provides authentication-related functions and the current user object
// It includes a function to get the current user and a check for admin status
export function getCurrentUser() {
  return {
  userId: 'jaetill', // or your permanent test ID
  name: 'Jason',
  role: localStorage.getItem('devRole') || 'admin'
  };
}

// This function returns the current user object with a userId, name, and role 
// The role is determined by a value stored in localStorage, defaulting to 'admin' if not set




// Dev-friendly admin check
export function isAdmin(user) {
  return user?.role === 'admin';
}
// This function checks if the current user is an admin based on their role
// It returns true if the user is an admin, otherwise false

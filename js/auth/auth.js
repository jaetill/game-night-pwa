// This module handles user authentication and role management
// It provides a mock user object for development purposes and includes a function to check admin status


// This module provides authentication-related functions and the current user object
// It includes a function to get the current user and a check for admin status
return {
  userId: 'jaetill', // or your permanent test ID
  name: 'Jason',
  role: localStorage.getItem('devRole') || 'admin'
};



// Dev-friendly admin check
export function isAdmin(user) {
  return user?.role === 'admin';
}
// This function checks if the current user is an admin based on their role
// It returns true if the user is an admin, otherwise false

// Temporary hardcoded user for testing
export const currentUser = {
  userId: 'jaetill',
  name: 'Jason',
  role: localStorage.getItem('devRole') || 'admin' // or 'guest'
};

// Dev-friendly admin check
export async function isAdmin(user) {
  return user.role === 'admin';
}

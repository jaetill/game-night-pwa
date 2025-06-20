export const currentUser = {
  userId: 'user-123',         // This can be dynamic later
  name: 'Jason'               // You could load this from localStorage too
};

// Toggle this based on your admin logic—currently hardcoded
export const isAdmin = true;

// Optional: expose a mutable ownedGames array so other modules can reference it
export let ownedGames = [];

export function setOwnedGames(games) {
  ownedGames = games;
}

// Game collection data. Mutated in place (never reassigned) so every
// importer's binding stays live — setOwnedGames replaces the CONTENTS.
export const ownedGames = [];

export function setOwnedGames(games) {
  ownedGames.length = 0;
  ownedGames.push(...games);
}

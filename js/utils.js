export function createGameNight({ date, time, snacks }) {
  return {
    id: Date.now().toString(),
    date,
    time,
    snacks,
    rsvps: [],
    suggestions: [],
    selectedGames: []
  };
}

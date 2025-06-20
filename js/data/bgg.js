import { ownedGames } from '../data/state.js';

export async function fetchOwnedGames(username) {
  const cached = localStorage.getItem("bggOwnedGames");
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      ownedGames.length = 0;
      ownedGames.push(...parsed); // ✅ mutate the shared array
      return;
    } catch {
      console.warn("Corrupt cache.");
    }
  }

  let tries = 0;

  async function tryFetch() {
    tries++;
    const res = await fetch(`https://boardgamegeek.com/xmlapi2/collection?username=${username}&own=1`);
    const text = await res.text();
    const xml = new DOMParser().parseFromString(text, "text/xml");

    if (xml.querySelector("message")) {
      if (tries < 5) return setTimeout(tryFetch, 3000);
      console.warn("BGG timeout.");
      return;
    }

    const games = [...xml.querySelectorAll("item")].map(item => ({
      id: item.getAttribute("objectid"),
      title: item.querySelector("name")?.textContent || "Untitled"
    }));

    ownedGames.length = 0;
    ownedGames.push(...games); // ✅ update in-place

    localStorage.setItem("bggOwnedGames", JSON.stringify(ownedGames));
  }

  tryFetch();
}

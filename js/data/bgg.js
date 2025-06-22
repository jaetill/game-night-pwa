import { ownedGames } from '../data/state.js';

export async function fetchOwnedGames(username) {
  const cached = localStorage.getItem("bggOwnedGames");
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      ownedGames.length = 0;
      ownedGames.push(...parsed);
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

    const baseGames = [...xml.querySelectorAll("item")].map(item => ({
      id: item.getAttribute("objectid"),
      title: item.querySelector("name")?.textContent || "Untitled"
    }));

    // Fetch game details with stats
    const ids = baseGames.map(g => g.id).join(',');
    //const detailsRes = await fetch(`https://boardgamegeek.com/xmlapi2/thing?id=${ids}&stats=1`);
	const corsProxy = 'https://corsproxy.io/?';
	const proxiedUrl = `${corsProxy}https://boardgamegeek.com/xmlapi2/thing?id=${ids}&stats=1`;
	const detailsRes = await fetch(proxiedUrl);
    const detailsText = await detailsRes.text();
    const detailsXml = new DOMParser().parseFromString(detailsText, "text/xml");

    const enrichedGames = baseGames.map(game => {
      const detail = detailsXml.querySelector(`item[objectid="${game.id}"]`);
      const min = detail?.querySelector("minplayers")?.getAttribute("value");
      const max = detail?.querySelector("maxplayers")?.getAttribute("value");

      return {
        ...game,
        minPlayers: Number(min) || 1,
        maxPlayers: Number(max) || 99
      };
    });

    ownedGames.length = 0;
    ownedGames.push(...enrichedGames);
    localStorage.setItem("bggOwnedGames", JSON.stringify(ownedGames));
  }

  tryFetch();
}

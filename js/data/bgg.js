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

  // 🔁 Break game IDs into chunks of 40
  const chunkSize = 20;
  const chunks = [];
  for (let i = 0; i < baseGames.length; i += chunkSize) {
    chunks.push(baseGames.slice(i, i + chunkSize));
  }

  const enrichedGames = [];

  for (const chunk of chunks) {
    const ids = chunk.map(g => g.id).join(',');
    const corsProxy = 'https://corsproxy.io/?';
    const detailsUrl = `${corsProxy}https://boardgamegeek.com/xmlapi2/thing?id=${ids}&stats=1`;

    try {
      const detailsRes = await fetch(detailsUrl);
      const detailsText = await detailsRes.text();
      const detailsXml = new DOMParser().parseFromString(detailsText, "text/xml");

      chunk.forEach(game => {
		
        const detail = detailsXml.querySelector(`item[id="${game.id}"]`);
		if (!detail) {
			console.warn(`No detail found for game ID ${game.id}`);
			return;
}
        const min = detail?.querySelector("minplayers")?.getAttribute("value");
        const max = detail?.querySelector("maxplayers")?.getAttribute("value");
        console.log(detail.outerHTML); // optional, just for verification
        const thumbnail = detail?.querySelector("thumbnail")?.textContent;
		    //console.log("Detail XML for game", game.id, detail?.outerHTML);

        enrichedGames.push({
          ...game,
          minPlayers: Number(min) || 1,
          maxPlayers: Number(max) || 99,
           thumbnail: thumbnail || ''
        });
      });
    } catch (err) {
      console.warn(`Failed to load chunk for IDs: ${ids}`, err);
    }
  }

  ownedGames.length = 0;
  ownedGames.push(...enrichedGames);

  localStorage.setItem("bggOwnedGames", JSON.stringify(ownedGames));
}


  tryFetch();
}

export let ownedGames = [];

export async function fetchOwnedGames(username) {
  const cached = localStorage.getItem("bggOwnedGames");
  if (cached) {
    try {
      ownedGames = JSON.parse(cached);
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

    ownedGames = [...xml.querySelectorAll("item")].map(item => ({
      id: item.getAttribute("objectid"),
      title: item.querySelector("name")?.textContent || "Untitled"
    }));

    localStorage.setItem("bggOwnedGames", JSON.stringify(ownedGames));
  }

  tryFetch();
}

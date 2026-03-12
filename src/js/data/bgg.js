import { ownedGames } from '../data/state.js';

const CORS_PROXY = 'https://corsproxy.io/?url=';
const CACHE_KEY  = 'bggOwnedGames';
const CACHE_VER  = 'bggCacheVersion';
const CURRENT_VER = '3'; // bump this to force a refresh after breaking changes

export async function fetchOwnedGames(username) {
  // Ignore cache if it's empty or from an older version
  const cachedVer  = localStorage.getItem(CACHE_VER);
  const cachedData = localStorage.getItem(CACHE_KEY);

  if (cachedVer === CURRENT_VER && cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      if (parsed.length > 0) {
        ownedGames.length = 0;
        ownedGames.push(...parsed);
        console.log(`BGG: loaded ${parsed.length} games from cache.`);
        return;
      }
    } catch {
      console.warn('BGG: corrupt cache, refetching.');
    }
  }

  console.log(`BGG: fetching collection for "${username}"…`);
  let tries = 0;

  async function tryFetch() {
    tries++;

    let text, xml;
    try {
      const url = `${CORS_PROXY}${encodeURIComponent(`https://boardgamegeek.com/xmlapi2/collection?username=${username}&own=1`)}`;
      const res = await fetch(url);
      text = await res.text();
      xml  = new DOMParser().parseFromString(text, 'text/xml');
    } catch (err) {
      console.warn('BGG: collection fetch failed.', err);
      return;
    }

    // BGG returns a <message> while it queues the request — retry
    if (xml.querySelector('message')) {
      console.log(`BGG: response queued, retrying (${tries}/5)…`);
      if (tries < 5) return setTimeout(tryFetch, 3000);
      console.warn('BGG: gave up after 5 tries.');
      return;
    }

    const baseGames = [...xml.querySelectorAll('item')].map(item => ({
      id:    item.getAttribute('objectid'),
      title: item.querySelector('name')?.textContent || 'Untitled',
    }));

    console.log(`BGG: found ${baseGames.length} games, enriching…`);

    // Enrich in chunks of 20 to get player counts + thumbnails
    const enriched = [];
    for (let i = 0; i < baseGames.length; i += 20) {
      const chunk = baseGames.slice(i, i + 20);
      const ids   = chunk.map(g => g.id).join(',');
      const detailUrl = `${CORS_PROXY}${encodeURIComponent(`https://boardgamegeek.com/xmlapi2/thing?id=${ids}&stats=1`)}`;

      try {
        const detailRes  = await fetch(detailUrl);
        const detailText = await detailRes.text();
        const detailXml  = new DOMParser().parseFromString(detailText, 'text/xml');

        chunk.forEach(game => {
          const detail = detailXml.querySelector(`item[id="${game.id}"]`);
          if (!detail) return;

          enriched.push({
            ...game,
            minPlayers: Number(detail.querySelector('minplayers')?.getAttribute('value')) || 1,
            maxPlayers: Number(detail.querySelector('maxplayers')?.getAttribute('value')) || 99,
            thumbnail:  detail.querySelector('thumbnail')?.textContent || '',
          });
        });
      } catch (err) {
        console.warn(`BGG: failed to enrich chunk ${ids}`, err);
        // Still include games without enrichment rather than silently dropping them
        chunk.forEach(game => enriched.push({ ...game, minPlayers: 1, maxPlayers: 99, thumbnail: '' }));
      }
    }

    ownedGames.length = 0;
    ownedGames.push(...enriched);

    localStorage.setItem(CACHE_KEY,  JSON.stringify(enriched));
    localStorage.setItem(CACHE_VER,  CURRENT_VER);
    console.log(`BGG: cached ${enriched.length} games.`);
  }

  tryFetch();
}

export function clearBggCache() {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_VER);
}

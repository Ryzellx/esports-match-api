// Liquipedia MediaWiki API client.
// Keyless, official API, no Cloudflare block. Respects ToS: gzip, custom UA, 1 req/2s.
const UA = "EsportsAPI/1.0 (contact: github.com/Ryzellx)";
const CACHE_TTL = 5 * 60 * 1000;
const MIN_INTERVAL = 2100; // 1 req / 2s per ToS (+margin)

const cache = new Map();
let lastReq = 0;

export const GAMES = {
  mobilelegends:  { wiki: "mobilelegends",  name: "Mobile Legends: Bang Bang", type: "mobile" },
  valorant:       { wiki: "valorant",       name: "Valorant",                  type: "pc" },
  counterstrike:  { wiki: "counterstrike",  name: "Counter-Strike 2",          type: "pc" },
  honorofkings:   { wiki: "honorofkings",   name: "Honor of Kings",            type: "mobile" },
  freefire:       { wiki: "freefire",       name: "Free Fire",                 type: "mobile" },
  dota2:          { wiki: "dota2",          name: "Dota 2",                    type: "pc" },
  leagueoflegends:{ wiki: "leagueoflegends",name: "League of Legends",         type: "pc" },
  pubgmobile:     { wiki: "pubgmobile",     name: "PUBG Mobile",               type: "mobile" },
};

export class UpstreamError extends Error {
  constructor(source, detail) { super(`${source}: ${detail}`); this.source = source; this.detail = detail; }
}

async function throttledFetch(url) {
  const wait = MIN_INTERVAL - (Date.now() - lastReq);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastReq = Date.now();
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Encoding": "gzip" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new UpstreamError("liquipedia", `HTTP ${res.status}`);
  return res.json();
}

export async function mwApi(wiki, params) {
  const qs = new URLSearchParams({ format: "json", ...params }).toString();
  const url = `https://liquipedia.net/${wiki}/api.php?${qs}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  const data = await throttledFetch(url);
  if (data.error) throw new UpstreamError("liquipedia", data.error.info || data.error.code);
  cache.set(url, { ts: Date.now(), data });
  return data;
}

export async function searchPages(game, q, limit = 10) {
  const { wiki } = GAMES[game];
  const d = await mwApi(wiki, { action: "query", list: "search", srsearch: q, srlimit: limit, srnamespace: 0 });
  return d.query.search.map(s => ({ title: s.title, snippet: s.snippet.replace(/<[^>]+>/g, "") }));
}

export async function pageExtract(game, title) {
  const { wiki } = GAMES[game];
  const d = await mwApi(wiki, {
    action: "query", prop: "extracts|pageimages", exintro: 1, explaintext: 1,
    pithumbsize: 300, titles: title,
  });
  const p = Object.values(d.query.pages)[0];
  if (!p || p.missing) return null;
  return { title: p.title, extract: p.extract || null, thumbnail: p.thumbnail?.source || null,
           url: `https://liquipedia.net/${wiki}/${encodeURIComponent(p.title.replace(/ /g, "_"))}` };
}

export async function pageWikitext(game, titles) {
  const { wiki } = GAMES[game];
  const list = Array.isArray(titles) ? titles.slice(0, 50).join("|") : titles;
  const d = await mwApi(wiki, {
    action: "query", prop: "revisions", rvprop: "content", rvslots: "main", titles: list,
  });
  const out = {};
  for (const p of Object.values(d.query.pages)) {
    if (p.missing) continue;
    out[p.title] = p.revisions?.[0]?.slots?.main?.["*"] || "";
  }
  return out;
}

export async function categoryMembers(game, category, limit = 50) {
  const { wiki } = GAMES[game];
  const d = await mwApi(wiki, {
    action: "query", list: "categorymembers", cmtitle: `Category:${category}`,
    cmlimit: Math.min(500, limit), cmtype: "page",
  });
  return d.query.categorymembers.map(m => m.title);
}

// Parse {{Infobox X |key=value ...}} params from wikitext (flat, first-level)
export function parseInfobox(wikitext, name) {
  const i = wikitext.indexOf(`{{Infobox ${name}`);
  if (i < 0) return null;
  let depth = 0, j = i;
  for (; j < wikitext.length - 1; j++) {
    if (wikitext[j] === "{" && wikitext[j + 1] === "{") { depth++; j++; }
    else if (wikitext[j] === "}" && wikitext[j + 1] === "}") { depth--; j++; if (depth === 0) break; }
  }
  const body = wikitext.slice(i, j + 1);
  const params = {};
  for (const m of body.matchAll(/\|([^|=]+)=([^\n|]*)/g)) {
    params[m[1].trim()] = m[2].trim().replace(/<[^>]+>/g, "").replace(/\[+/g, "").replace(/\]+/g, "");
  }
  return params;
}

export function clearCache() { cache.clear(); }

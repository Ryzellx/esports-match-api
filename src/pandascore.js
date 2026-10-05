// PandaScore API client — free tier, key via PANDASCORE_API_KEY env (never hardcoded).
// Covers: CS2, Dota 2, LoL, Valorant (+ more). https://pandascore.co
import { UpstreamError } from "./liquipedia.js";

const UA = "EsportsAPI/1.0 (contact: github.com/Ryzellx)";
const BASE = "https://api.pandascore.co";
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export const PS_GAMES = { counterstrike: "csgo", dota2: "dota2", leagueoflegends: "lol", valorant: "valorant" };

export function hasKey() { return !!process.env.PANDASCORE_API_KEY; }

async function ps(path) {
  const key = process.env.PANDASCORE_API_KEY;
  if (!key) throw new UpstreamError("pandascore", "PANDASCORE_API_KEY belum diset. Daftar gratis di pandascore.co lalu set env var.");
  const url = `${BASE}${path}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  const res = await fetch(url, { headers: { "Authorization": `Bearer ${key}`, "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  if (res.status === 401) throw new UpstreamError("pandascore", "API key tidak valid (401)");
  if (res.status === 429) throw new UpstreamError("pandascore", "rate limit PandaScore tercapai (429)");
  if (!res.ok) throw new UpstreamError("pandascore", `HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, { ts: Date.now(), data });
  return data;
}

const norm = (m) => ({
  id: String(m.id),
  game: m.videogame?.slug || null,
  name: m.name || null,
  tournament: m.league?.name && m.serie ? `${m.league.name} ${m.serie.full_name || ""}`.trim() : (m.tournament?.name || null),
  team1: m.opponents?.[0]?.opponent?.name || null,
  team2: m.opponents?.[1]?.opponent?.name || null,
  team1_score: m.results?.[0]?.score ?? null,
  team2_score: m.results?.[1]?.score ?? null,
  winner: m.winner?.name || null,
  status: m.status, // not_started | running | finished
  begin_at: m.begin_at || null,
  scheduled_at: m.scheduled_at || null,
  streams: (m.streams_list || []).map(s => ({ url: s.raw_url, language: s.language })),
});

export async function matches(game, status = "recent", limit = 20) {
  const slug = PS_GAMES[game];
  if (!slug) throw new UpstreamError("pandascore", `game '${game}' tidak didukung PandaScore`);
  limit = Math.min(100, Math.max(1, limit));
  let path;
  if (status === "upcoming") path = `/${slug}/matches/upcoming?per_page=${limit}`;
  else if (status === "live") path = `/${slug}/matches/running?per_page=${limit}`;
  else path = `/${slug}/matches/past?per_page=${limit}`;
  return (await ps(path)).map(norm);
}

export async function matchDetail(game, id) {
  const slug = PS_GAMES[game];
  if (!slug) throw new UpstreamError("pandascore", `game '${game}' tidak didukung PandaScore`);
  return norm(await ps(`/${slug}/matches/${id}`));
}

export function clearCache() { cache.clear(); }

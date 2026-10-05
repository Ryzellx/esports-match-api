// OpenDota API client — keyless, official, no block. Dota 2 pro matches.
import { UpstreamError } from "./liquipedia.js";

const UA = "EsportsAPI/1.0 (contact: github.com/Ryzellx)";
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function od(path) {
  const url = `https://api.opendota.com/api${path}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new UpstreamError("opendota", `HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, { ts: Date.now(), data });
  return data;
}

const norm = (m) => ({
  id: String(m.match_id),
  game: "dota2",
  tournament: m.league_name || null,
  team1: m.radiant_name || "Radiant",
  team2: m.dire_name || "Dire",
  team1_score: m.radiant_score ?? null,
  team2_score: m.dire_score ?? null,
  winner: m.radiant_win === true ? (m.radiant_name || "Radiant") : m.radiant_win === false ? (m.dire_name || "Dire") : null,
  start_time: m.start_time ? new Date(m.start_time * 1000).toISOString() : null,
  duration_sec: m.duration ?? null,
  series: m.series_id ? { id: m.series_id, type: m.series_type === 2 ? "Bo3" : m.series_type === 1 ? "Bo5" : null } : null,
});

export async function proMatches(limit = 20) {
  const d = await od("/proMatches");
  return d.slice(0, limit).map(norm);
}

export async function matchDetail(matchId) {
  const d = await od(`/matches/${matchId}`);
  if (d.error) throw new UpstreamError("opendota", d.error);
  const base = {
    id: String(d.match_id),
    game: "dota2",
    tournament: d.league?.name || null,
    team1: d.radiant_name || "Radiant",
    team2: d.dire_name || "Dire",
    team1_score: d.radiant_score ?? null,
    team2_score: d.dire_score ?? null,
    winner: d.radiant_win ? (d.radiant_name || "Radiant") : (d.dire_name || "Dire"),
    start_time: d.start_time ? new Date(d.start_time * 1000).toISOString() : null,
    duration_sec: d.duration ?? null,
    radiant_win: d.radiant_win,
    picks_bans: (d.picks_bans || []).map(pb => ({ hero_id: pb.hero_id, is_pick: pb.is_pick, team: pb.team === 0 ? "radiant" : "dire", order: pb.order })),
    players: (d.players || []).map(p => ({
      name: p.personaname || p.name || null,
      team: p.isRadiant ? "radiant" : "dire",
      hero_id: p.hero_id, kills: p.kills, deaths: p.deaths, assists: p.assists,
      gold_per_min: p.gold_per_min, xp_per_min: p.xp_per_min,
    })),
  };
  return base;
}

export async function proTeams(q, limit = 20) {
  const d = await od("/teams");
  const query = (q || "").toLowerCase();
  return d
    .filter(t => !query || (t.name || "").toLowerCase().includes(query))
    .slice(0, limit)
    .map(t => ({ id: t.team_id, name: t.name, tag: t.tag || null, wins: t.wins, losses: t.losses,
                 rating: t.rating ? Math.round(t.rating) : null, logo: t.logo_url || null }));
}

export function clearCache() { cache.clear(); }

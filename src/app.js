import express from "express";
import rateLimit from "express-rate-limit";
import { GAMES, UpstreamError, searchPages, pageExtract, pageWikitext, categoryMembers, parseInfobox, clearCache as clearLq } from "./liquipedia.js";
import * as od from "./opendota.js";
import * as ps from "./pandascore.js";

const err = (e, res) => {
  if (e instanceof UpstreamError) {
    const code = /belum diset|tidak didukung/.test(e.detail) ? 503 : 502;
    return res.status(code).json({ error: "upstream_error", source: e.source, detail: e.detail });
  }
  return res.status(500).json({ error: "internal", detail: String(e).slice(0, 200) });
};

const parseDate = (s) => {
  if (!s) return null;
  const t = Date.parse(s.replace(/{{[^}]+}}/g, "").trim());
  return isNaN(t) ? null : t;
};

const gameOr400 = (game, res) => {
  if (!GAMES[game]) { res.status(400).json({ error: "bad_game", detail: `game harus salah satu: ${Object.keys(GAMES).join(", ")}` }); return null; }
  return GAMES[game];
};

export function createApp() {
  const app = express();
  app.use(express.json());
  app.set("trust proxy", 1);

  const gl = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false,
    handler: (_, res) => res.status(429).json({ error: "rate_limited", detail: "Too many requests, slow down." }) });
  app.use(gl);
  const rl = (max) => rateLimit({ windowMs: 60_000, max, standardHeaders: true, legacyHeaders: false,
    handler: (_, res) => res.status(429).json({ error: "rate_limited", detail: "Too many requests, slow down." }) });

  app.get("/health", (_, res) => res.json({
    ok: true, sources: { liquipedia: "mediawiki-api (keyless)", opendota: "keyless", pandascore: ps.hasKey() ? "key-set" : "no-key" },
  }));

  app.get("/api/v1/games", (_, res) => res.json({
    count: Object.keys(GAMES).length,
    games: Object.entries(GAMES).map(([id, g]) => ({ id, ...g })),
  }));

  // ---- MATCHES ----
  app.get("/api/v1/matches", rl(30), async (req, res) => {
    const game = req.query.game || "dota2";
    if (!gameOr400(game, res)) return;
    const status = ["upcoming", "live", "recent"].includes(req.query.status) ? req.query.status : "recent";
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    try {
      if (game === "dota2" && status === "recent") {
        return res.json({ game, status, source: "opendota", count: limit, results: await od.proMatches(limit) });
      }
      if (ps.PS_GAMES[game]) {
        return res.json({ game, status, source: "pandascore", results: await ps.matches(game, status, limit) });
      }
      return res.status(503).json({ error: "not_supported",
        detail: `Match live untuk '${game}' butuh PANDASCORE_API_KEY (gratis di pandascore.co). Dota 2 tersedia keyless via OpenDota.` });
    } catch (e) { err(e, res); }
  });

  app.get("/api/v1/match", rl(30), async (req, res) => {
    const game = req.query.game || "dota2";
    if (!gameOr400(game, res)) return;
    const id = (req.query.id || "").trim();
    if (!id) return res.status(400).json({ error: "bad_query", detail: "id wajib" });
    try {
      if (game === "dota2" && /^\d+$/.test(id)) {
        return res.json({ game, source: "opendota", ...(await od.matchDetail(id)) });
      }
      if (ps.PS_GAMES[game]) return res.json({ game, source: "pandascore", ...(await ps.matchDetail(game, id)) });
      return res.status(503).json({ error: "not_supported", detail: `Detail match '${game}' butuh PANDASCORE_API_KEY.` });
    } catch (e) { err(e, res); }
  });

  // ---- TEAMS (Liquipedia) ----
  app.get("/api/v1/teams", rl(30), async (req, res) => {
    const game = req.query.game || "valorant";
    if (!gameOr400(game, res)) return;
    const q = (req.query.q || "").trim();
    if (q.length < 2) return res.status(400).json({ error: "bad_query", detail: "q minimal 2 karakter" });
    try {
      if (game === "dota2" && !q) return res.json({ game, source: "opendota", results: await od.proTeams("", 20) });
      if (game === "dota2") return res.json({ game, source: "opendota", results: await od.proTeams(q, 20) });
      const results = await searchPages(game, q, 10);
      res.json({ game, source: "liquipedia", count: results.length, results });
    } catch (e) { err(e, res); }
  });

  app.get("/api/v1/team", rl(30), async (req, res) => {
    const game = req.query.game || "valorant";
    if (!gameOr400(game, res)) return;
    const name = (req.query.name || "").trim();
    if (!name) return res.status(400).json({ error: "bad_query", detail: "name wajib" });
    try {
      const page = await pageExtract(game, name);
      if (!page) return res.status(404).json({ error: "not_found", detail: name });
      const wt = await pageWikitext(game, page.title);
      const info = parseInfobox(wt[page.title] || "", "team") || {};
      res.json({ game, source: "liquipedia", name: page.title, url: page.url,
        logo: page.thumbnail, summary: page.extract,
        region: info.region || info.location || null, coach: info.coach || null,
        founded: info.created || info.founded || null });
    } catch (e) { err(e, res); }
  });

  // ---- PLAYERS (Liquipedia) ----
  app.get("/api/v1/players", rl(30), async (req, res) => {
    const game = req.query.game || "valorant";
    if (!gameOr400(game, res)) return;
    const q = (req.query.q || "").trim();
    if (q.length < 2) return res.status(400).json({ error: "bad_query", detail: "q minimal 2 karakter" });
    try {
      const results = await searchPages(game, q, 10);
      res.json({ game, source: "liquipedia", count: results.length, results });
    } catch (e) { err(e, res); }
  });

  app.get("/api/v1/player", rl(30), async (req, res) => {
    const game = req.query.game || "valorant";
    if (!gameOr400(game, res)) return;
    const name = (req.query.name || "").trim();
    if (!name) return res.status(400).json({ error: "bad_query", detail: "name wajib" });
    try {
      const page = await pageExtract(game, name);
      if (!page) return res.status(404).json({ error: "not_found", detail: name });
      const wt = await pageWikitext(game, page.title);
      const info = parseInfobox(wt[page.title] || "", "player") || {};
      res.json({ game, source: "liquipedia", name: page.title, url: page.url,
        photo: page.thumbnail, summary: page.extract,
        real_name: info.name || null, nationality: info.nationality || info.country || null,
        team: info.team || null, role: info.role || null, game_id: info.id || null });
    } catch (e) { err(e, res); }
  });

  // ---- TOURNAMENTS (Liquipedia) ----
  app.get("/api/v1/tournaments", rl(30), async (req, res) => {
    const game = req.query.game || "valorant";
    if (!gameOr400(game, res)) return;
    const status = ["upcoming", "ongoing", "recent"].includes(req.query.status) ? req.query.status : "recent";
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    try {
      let titles = [];
      for (const tier of ["S-Tier_Tournaments", "A-Tier_Tournaments"]) {
        try { titles.push(...await categoryMembers(game, tier, 60)); } catch {}
        if (titles.length >= 80) break;
      }
      // ambil tanggal dari infobox (batch 50 judul per request)
      const now = Date.now();
      const out = [];
      for (let i = 0; i < Math.min(titles.length, 50); i += 50) {
        const wt = await pageWikitext(game, titles.slice(i, i + 50));
        for (const [title, text] of Object.entries(wt)) {
          const info = parseInfobox(text, "league") || {};
          const start = parseDate(info.startdate || info.sdate);
          const end = parseDate(info.enddate || info.edate);
          let st = "unknown";
          if (start && end) st = end < now ? "recent" : start > now ? "upcoming" : "ongoing";
          else if (start) st = start > now ? "upcoming" : "recent";
          if (st !== status) continue;
          out.push({ name: info.name || title, ticker: info.tickername || null,
            startdate: info.startdate || info.sdate || null, enddate: info.enddate || info.edate || null,
            prize: info.prizepool || info.prizepoolusd || info.prizepool2 || null,
            location: info.location || info.city || info.country || null,
            status: st, url: `https://liquipedia.net/${GAMES[game].wiki}/${encodeURIComponent(title.replace(/ /g, "_"))}` });
        }
        if (out.length >= limit * 2) break;
      }
      out.sort((a, b) => (parseDate(b.startdate) || 0) - (parseDate(a.startdate) || 0));
      res.json({ game, status, source: "liquipedia", count: Math.min(limit, out.length), results: out.slice(0, limit) });
    } catch (e) { err(e, res); }
  });

  app.post("/api/v1/cache/clear", (_, res) => {
    clearLq(); od.clearCache(); ps.clearCache();
    res.json({ ok: true });
  });

  return app;
}

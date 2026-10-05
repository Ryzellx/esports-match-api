# Esports Match Tracker API

REST API tracker match esports pro — PC & mobile games. Data dari API resmi (tanpa scraping HTML, tanpa diblokir Cloudflare).

## Sumber Data

| Sumber | Cakupan | Key |
|---|---|---|
| **Liquipedia MediaWiki API** | Tournament, tim, player (8 game) | ❌ tidak butuh |
| **OpenDota API** | Match pro Dota 2 (recent + detail) | ❌ tidak butuh |
| **PandaScore API** | Match live/upcoming CS2, Valorant, LoL, Dota 2 | ✅ gratis di [pandascore.co](https://pandascore.co) → set `PANDASCORE_API_KEY` |

> **Catatan jujur:** `action=cargoquery` sudah tidak ada di Liquipedia (diganti LiquipediaDB v3 yang butuh API key). API ini memakai MediaWiki API resmi yang keyless + OpenDota keyless. Match live non-Dota 2 butuh key PandaScore gratis (env var, tidak di-hardcode).

## Game yang Didukung

| ID | Nama | Tipe |
|---|---|---|
| `mobilelegends` | Mobile Legends: Bang Bang | mobile |
| `valorant` | Valorant | PC |
| `counterstrike` | Counter-Strike 2 | PC |
| `honorofkings` | Honor of Kings | mobile |
| `freefire` | Free Fire | mobile |
| `dota2` | Dota 2 | PC |
| `leagueoflegends` | League of Legends | PC |
| `pubgmobile` | PUBG Mobile | mobile |

## Quick Start

```bash
npm install
npm start
# API: http://localhost:8079

# Opsional: match live CS2/Valorant/LoL
export PANDASCORE_API_KEY=isi_key_gratis_dari_pandascore_co
npm start
```

Deploy ke Vercel: connect repo, auto-detect via `api/index.js`.

## Endpoint

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/health` | Status + sumber data aktif |
| GET | `/api/v1/games` | Daftar 8 game |
| GET | `/api/v1/matches?game=&status=&limit=` | Match (status: upcoming/live/recent) |
| GET | `/api/v1/match?game=&id=` | Detail match |
| GET | `/api/v1/teams?game=&q=` | Cari tim |
| GET | `/api/v1/team?game=&name=` | Detail tim |
| GET | `/api/v1/players?game=&q=` | Cari player |
| GET | `/api/v1/player?game=&name=` | Detail player |
| GET | `/api/v1/tournaments?game=&status=&limit=` | Tournament (status: upcoming/ongoing/recent) |
| POST | `/api/v1/cache/clear` | Bersihkan cache |

## Contoh

```bash
# Match Dota 2 terbaru (keyless)
curl "http://localhost:8079/api/v1/matches?game=dota2&status=recent&limit=5"

# Detail match
curl "http://localhost:8079/api/v1/match?game=dota2&id=9030565813"

# Cari tim Valorant
curl "http://localhost:8079/api/v1/teams?game=valorant&q=sentinels"

# Detail tim
curl "http://localhost:8079/api/v1/team?game=valorant&name=Sentinels"

# Cari player
curl "http://localhost:8079/api/v1/players?game=valorant&q=tenz"

# Tournament CS2 yang sedang berjalan
curl "http://localhost:8079/api/v1/tournaments?game=counterstrike&status=ongoing"

# Match live Valorant (butuh PANDASCORE_API_KEY)
curl "http://localhost:8079/api/v1/matches?game=valorant&status=live"
```

## Rate Limit & Cache

- Global: 120 req/menit · endpoint data: 30 req/menit (429 kalau lewat)
- Cache upstream: 5 menit
- Liquipedia: throttle 1 req/2 dtk sesuai ToS mereka

## Atribusi

Data turnamen/tim/player: [Liquipedia](https://liquipedia.net) (CC-BY-SA 3.0).
Match Dota 2: [OpenDota](https://www.opendota.com/).

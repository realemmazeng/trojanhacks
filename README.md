# Safety Path: USC

Safety Path recommends a walking route around USC based on more than travel time. It weighs street lighting, recent crime, street activity and USC DPS patrol coverage. It then explains in plain language why it picked that route over the fastest one.

It's a phone-first web app that students can install on their home screen. The interface is the React app in [`frontend/`](frontend/). The routing engine and API are in Python (`safe_route.py`, `safety_server.py`).

> **Disclaimer:** Safety Path is informational and does not guarantee safety. Trust your instincts and stay aware of your surroundings. If you feel unsafe, call USC DPS at **213-740-4321** or **911**.

## Features

- **"Where to?"**: search for a destination. Suggestions understand intersections ("28th & Orchard"), street addresses and place names, and are limited to the service area: W Adams–W Jefferson × S Vermont–S Figueroa.
- **Start point:** your phone's GPS location when you're inside the service area; otherwise a stand-in point on campus.
- **Leave now or plan for later:** lighting, darkness, street activity and the timing of past incidents all depend on when you walk.
- **One recommended path next to the fastest path** on a dark map, with walking times and the extra minutes.
- **Route preference slider** from Fastest to Safest, on the route screen. Moving it re-plans the path, and the app remembers your setting.
- **"Why this path?"**: short reasons, plus a details screen comparing both paths on lighting coverage, street activity, USC patrol coverage, recent alerts and walking time.
- **Data sources** with last-updated dates, and the disclaimer directly above "Start walking".
- **Live tracking with your phone's real GPS:**
  - your position on the map, with a GPS-accuracy halo
  - turn-by-turn instructions
  - time and distance left, and arrival time
  - more than 30 m off the path for 10 seconds: a "You've left the safety path" alert, then an automatic new path from where you are ("New path from here" does it right away)
  - keeps the screen awake where the phone allows it
  - an "Arrived safely" screen within 25 m of the destination
- **SOS sheet** on Home and during tracking: call USC DPS, call 911, or copy a Google Maps link to your location.
- **Trusted contacts, sharing and walk history:** stored on the phone. Sharing records who a walk was shared with, but doesn't send messages yet.
- **Installable:** add it to your home screen and it opens full screen. The app itself loads offline.

## How a path is chosen

Every street segment in the OpenStreetMap walking network gets a cost. The recommended path has the lowest total cost; the fastest path uses length alone.

```
cost = length × (1 + safety × ( 4.0 · crime_risk
                              + 1.0 · darkness_exposure
                              + 1.0 · (1 − busyness)
                              + 1.5 · (1 − lighting)
                              + 0.5 · outside_patrol_area
                              + 1.0 · is_alley ))
```

| Factor | How it's computed |
|---|---|
| **Crime risk** | Incidents near each segment (within roughly 200 m) add risk; closer incidents count more. Each incident is weighted by how serious it was, how recent it was (its weight halves every year), and how close it happened to the time you're walking. USC DPS alerts count double. |
| **Lighting** | Total streetlight wattage near the segment, using LA City streetlight data. |
| **Darkness** | How far the sun is below the horizon at your departure time, combined with the segment's lighting. |
| **Busyness** | Typical street activity by hour and street type. LA Metro Bike Share dock activity can raise it. BestTime venue busyness, if `BESTTIME_API_KEY` is set, can raise or lower it. |
| **USC patrol area** | 1 if the segment is outside the DPS patrol area, otherwise 0. |
| **Alleys** | Extra cost for alleys, driveways and parking aisles. |

The weights are set at the top of `safe_route.py`. They are judgment calls, not values fitted to data.

The factors shown in the app are computed as follows:

| Factor | Meaning |
|---|---|
| Lighting coverage | Share of the path with a streetlight within 35 m |
| Street activity | Average busyness at departure time, as a 0–100 score: High ≥ 60, Medium ≥ 30, otherwise Low |
| USC Safety Resource Proximity | Share of the path inside the patrol area |
| Recent relevant alerts | DPS alerts and LAPD incidents within 50 m of the path in the last 30 days |

## Data sources

| Data | Source |
|---|---|
| Walking network | [OpenStreetMap](https://www.openstreetmap.org/copyright), downloaded once through the Overpass API and saved locally |
| USC crime alerts | [USC DPS](https://dps.usc.edu/alerts/), collected by `fetch_alerts.py` and placed on the map (205 of 221 alerts) |
| LAPD incidents | `usc_crimes_location_time_type.csv`, 3,351 incidents in the USC area, 2024–2026 |
| Streetlights | [LA City streetlight dataset](https://data.lacity.org/d/twzm-wihy), 7,927 poles with wattage, downloaded by `fetch_streetlights.py` |
| USC patrol area | `patrol_zone.json`, an approximation of the [DPS UPC patrol area](https://dps.usc.edu/patrol/) |
| Live street activity | [LA Metro Bike Share](https://bikeshare.metro.net/) public real-time feed (no key needed); [BestTime](https://besttime.app) if you have a key |
| Place search | US Census geocoder, OpenStreetMap's Nominatim, and street names from the walking network |
| Map tiles | OpenStreetMap, darkened with a CSS filter |

## Getting started

Requires Python 3.12+ (standard library only) and Node 18+ (only to build the frontend).

```bash
# One-time data setup
python3 fetch_alerts.py         # USC DPS alerts -> alerts.json
python3 fetch_streetlights.py   # LA City streetlights -> streetlights.csv
python3 safe_route.py geocode   # place the alerts on the map -> alerts_geocoded.json

# Build the app UI (re-run after changing anything in frontend/)
cd frontend && npm install && npm run build && cd ..

# Run: API + app on one port
python3 safety_server.py        # http://127.0.0.1:8000
```

The first run downloads the OpenStreetMap walking network into `.cache/`.

### Working on the frontend

```bash
python3 safety_server.py        # backend on :8000
cd frontend && npm run dev      # http://localhost:5173, sends /path and /api to :8000
```

Optional settings live in `frontend/.env` (see `frontend/.env.example`):
- `VITE_USE_MOCK=1` uses the sample path instead of the backend.

### Use it on your phone

Phones only allow location access and installation over a secure (https) address. For a demo, expose your laptop with a free Cloudflare tunnel:

```bash
python3 safety_server.py
cloudflared tunnel --url http://127.0.0.1:8000
```

Open the `https://….trycloudflare.com` address it prints on your phone, then choose **Add to Home Screen**. The address changes every time you restart the tunnel.

Tracking always uses the phone's real location. On a laptop with no location access, it stays on "Finding your location…".

### Optional: better live data

```bash
python3 safe_route.py watch               # samples bike share every 2 min; live data kicks in after ~4 min
export BESTTIME_API_KEY=pri_xxx           # adds live venue busyness
```

### Command-line version

```bash
python3 safe_route.py route --from "USC Village" --to "28th Street & Orchard Avenue"
python3 safe_route.py route --from 34.0219,-118.28 --to "Vermont & 36th Place" \
    --time 2026-10-17T23:00 --safety 2 --json out.json
```

The CLI prints both routes, the reasons and the directions, and writes `route_map.html`.

## API

| Endpoint | Returns |
|---|---|
| `POST /path` | The app's endpoint, specified in [`frontend/docs/API_CONTRACT.md`](frontend/docs/API_CONTRACT.md). Takes an optional `safety` from 0 (fastest) to 2 (safest), default 1. Returns 422 when the start or destination is outside the service area. |
| `GET /api/geocode?q=…&limit=5` | `[{label, lat, lon, kind}]` |
| `GET /api/route?from=…&to=…&time=ISO&safety=1` | A more detailed route payload (risk, lighting, busyness, steps, live signals) |
| `GET /api/health` | Counts of loaded street segments, incidents, streetlights, and which UI is being served |

## Project layout

```
safe_route.py            Routing engine (RouteEngine), POST /path response builder, CLI
safety_server.py         HTTP server: API + the built frontend
fetch_alerts.py          Scrapes USC DPS crime alerts
fetch_streetlights.py    Downloads LA City streetlights
patrol_zone.json         DPS patrol area polygon (GeoJSON)
frontend/                The app (React + Vite + Leaflet)
  src/screens/           Splash, Login, Home, Search, Recommended, Why, Tracking, Arrived, Friends, Activity, Account
  src/api.js             POST /path client
  src/lib/geocode.js     Place search (backend first, Nominatim fallback)
  src/lib/location.js    GPS start point with campus fallback
  public/                Install manifest, service worker, icons
  docs/                  PRD and API contract
static/                  Older single-page UI; served only if frontend/dist hasn't been built
```

## Known limitations

- **The patrol area is an approximate rectangle**, not DPS's official boundary. Replace `patrol_zone.json` with coordinates from the [DPS patrol map PDF](https://dps.usc.edu/wp-content/uploads/2025/01/UPC-Patrol-Area.pdf). Inside the service area, nearly every path currently scores 100%.
- **Lighting can outweigh crime.** On some night routes the recommendation is much better lit but passes more incidents than the fastest path. The "Why this path?" bullets list only the advantages, but the details screen shows both paths side by side, including alerts. Tune `W_UNLIT` and `W_RISK` in `safe_route.py`.
- **Street activity is a proxy:** time-of-day patterns plus bike-share dock activity, not pedestrian counts. The PRD's "places open now" idea isn't built. The BestTime integration hasn't been tested against the real API.
- **GPS stops when the screen locks**, especially on iPhone. Background tracking would need a native wrapper such as Capacitor.
- **Placeholders:** login doesn't authenticate, and sharing doesn't send anything yet. Contacts and history live in the phone's browser storage.
- **Start point:** if the location prompt is ignored, the app waits 6 seconds before falling back to the campus stand-in.
- **Rerouting needs the service area:** if you wander outside it, no new path is found and the off-path banner shows why.
- Not built: voice directions, push notifications, game-day/event awareness.

# trojanhacks

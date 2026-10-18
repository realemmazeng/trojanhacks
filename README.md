# Safety Path: USC

Safety Path recommends a walking route around USC based on more than travel time. It weighs street lighting, recent crime, foot traffic and USC DPS patrol coverage. It then explains in plain language why it picked that route over the fastest one.

It runs as a web app that students can install on their phone's home screen. During a walk it tracks your location, reroutes you if you leave the route, and has an SOS button.

> **Disclaimer:** Safety Path is informational and does not guarantee safety. Trust your instincts and stay aware of your surroundings. If you feel unsafe, call USC DPS at **213-740-4321** or **911**.

## Features

- **Search like Google Maps:** enter a start and destination as an address, an intersection ("28th & Orchard"), a place name or `lat,lon`, with suggestions as you type. "Use my location" fills in the start from your GPS.
- **Departure time:** routes change with the time of day. Darkness, typical foot traffic and the timing of past incidents all depend on when you walk.
- **Safety slider:** from 0 (always the fastest route) to 2 (avoids risk as much as possible).
- **One recommended route plus the fastest route**, both drawn on the map, with walking times and the difference between them.
- **"Why this route?"** shows short, generated reasons, for example "Streetlights are 1.9× denser along this route" or "Adds 0.5 min vs. the fastest route".
- **Directions:** each step names the street, including which street an unnamed sidewalk runs along.
- **Data sources** with the date each was last updated, plus the safety disclaimer.
- **Live navigation:**
  - A GPS dot follows you along the route.
  - If you're more than 30 m off the route for 10 seconds, the app reroutes you.
  - It shows the distance and time left.
  - It keeps the screen awake where the phone allows it.
- **SOS sheet:** one tap to call USC DPS, call 911, or copy a Google Maps link to your location.
- **Installable:** add it to your home screen and it opens full screen. The app itself loads offline, and it remembers your last route.

## How a route is chosen

Every street segment in the OpenStreetMap walking network gets a cost. The route with the lowest total cost is the recommendation; the fastest route uses length alone.

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
| **Busyness** | Typical foot traffic by hour and street type. Near-real-time data replaces it where available: LA Metro Bike Share dock activity, and BestTime venue busyness if `BESTTIME_API_KEY` is set. |
| **USC patrol area** | 1 if the segment is outside the DPS patrol area, otherwise 0. |
| **Alleys** | Extra cost for alleys, driveways and parking aisles. |

The weights are set at the top of `safe_route.py`. They are judgment calls, not values fitted to data.

## Data sources

| Data | Source |
|---|---|
| Walking network | [OpenStreetMap](https://www.openstreetmap.org/copyright), downloaded once through the Overpass API and saved locally |
| USC crime alerts | [USC DPS](https://dps.usc.edu/alerts/), collected by `fetch_alerts.py` and placed on the map (205 of 221 alerts) |
| LAPD incidents | `usc_crimes_location_time_type.csv`, 3,351 incidents in the USC area, 2024–2026 |
| Streetlights | [LA City streetlight dataset](https://data.lacity.org/d/twzm-wihy), 7,927 poles with wattage, downloaded by `fetch_streetlights.py` |
| USC patrol area | `patrol_zone.json`, an approximation of the [DPS UPC patrol area](https://dps.usc.edu/patrol/) |
| Live foot traffic | [LA Metro Bike Share](https://bikeshare.metro.net/) public real-time feed (no key needed); [BestTime](https://besttime.app) if you have a key |
| Address lookup | US Census geocoder, OpenStreetMap's Nominatim, and street names from the walking network |

## Demo

https://github.com/user-attachments/assets/8d748167-e13b-48d1-b515-f91f640c1ded





## Getting started

Requires Python 3.12+ and nothing else; everything uses the standard library.

```bash
# One-time data setup
python3 fetch_alerts.py         # USC DPS alerts -> alerts.json
python3 fetch_streetlights.py   # LA City streetlights -> streetlights.csv
python3 safe_route.py geocode   # place the alerts on the map -> alerts_geocoded.json

# Run the app
python3 safety_server.py        # http://127.0.0.1:8000
```

The first run downloads the OpenStreetMap walking network into `.cache/`.

### Use it on your phone

Phones only allow location access and installation over a secure (https) address. For a demo, expose your laptop with a free Cloudflare tunnel:

```bash
python3 safety_server.py
cloudflared tunnel --url http://127.0.0.1:8000
```

Open the `https://….trycloudflare.com` address it prints on your phone, then choose **Add to Home Screen**. The address changes every time you restart the tunnel.

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
| `GET /api/route?from=…&to=…&time=ISO&safety=1` | `recommended` and `fastest` routes (coords, minutes, length, risk, lighting, patrol coverage, busyness, nearby alerts, steps), plus `reasons`, `sources`, `disclaimer` |
| `GET /api/geocode?q=…&limit=5` | `[{label, lat, lon, kind}]` |
| `GET /api/health` | Counts of loaded street segments, incidents, streetlights |

`from`/`to` accept `lat,lon`, an intersection, an address or a place name. Any page URL with `?from=…&to=…` routes automatically when opened, which makes routes shareable.

## Project layout

```
safe_route.py            Routing engine (RouteEngine) + CLI
safety_server.py         HTTP server: API + static files
fetch_alerts.py          Scrapes USC DPS crime alerts
fetch_streetlights.py    Downloads LA City streetlights
patrol_zone.json         DPS patrol area polygon (GeoJSON)
static/
  index.html             App shell
  app.js                 Map, search, route panel
  nav.js                 Live navigation + SOS
  style.css              Layout (side panel on desktop, bottom sheet on phone)
  sw.js                  Offline caching
  manifest.webmanifest   Home-screen install settings
```

**After editing CSS or JS:** bump the `?v=N` version in `static/index.html` and in the `SHELL` list in `static/sw.js`, and bump `VERSION` in `sw.js`. Otherwise phones keep the old cached copy.

## Known limitations

- **The patrol area is an approximate rectangle**, not DPS's official boundary. Replace `patrol_zone.json` with coordinates from the [DPS patrol map PDF](https://dps.usc.edu/wp-content/uploads/2025/01/UPC-Patrol-Area.pdf).
- **Lighting can outweigh crime.** On some night routes the recommendation is much better lit but passes more incidents than the fastest route. The "Why this route?" panel currently lists only the advantages. Tune `W_UNLIT` and `W_RISK` in `safe_route.py`.
- **Live foot traffic is a proxy.** Bike-share dock activity measures bike use, not pedestrians. The BestTime integration hasn't been tested against the real API yet.
- **GPS stops when the screen locks**, especially on iPhone. Background tracking would need a native wrapper such as Capacitor.
- Not yet built: voice turn-by-turn directions, route sharing, push notifications, game-day/event awareness.
# trojanhacks

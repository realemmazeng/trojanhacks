# USC Crime Alerts

Scrapes USC Department of Public Safety (DPS) crime alerts into clean JSON for a hackathon project.

## Data source

dps.usc.edu is WordPress, so alerts come from its public REST API (no auth, no HTML scraping):

```
https://dps.usc.edu/wp-json/wp/v2/posts?categories=5&per_page=10&page=5&_fields=id,date,title,link,content
```

- Category `5` = "Crime Alerts" (child of `2` = "Alerts"). ~221 posts, 2018–present.
- `per_page=10` matches the website's pagination, so API `page=N` == `https://dps.usc.edu/category/alerts/crime-alerts/page/N/`. Max `per_page` is 100.
- Totals are in response headers `X-WP-Total` and `X-WP-TotalPages`.
- `content.rendered` is HTML; `title.rendered` is the offense (HTML-escaped, e.g. `&#038;`).

## Files

- `fetch_alerts.py` — fetches and parses alerts. Stdlib only (Python 3.12).
  - `python3 fetch_alerts.py` → all alerts to `alerts.json`
  - `python3 fetch_alerts.py --page 5 -o page5.json` → one website page
- `alerts.json` — generated output; re-run the script to refresh.

## Output shape (one object per alert)

`id, title, offense, posted_at, occurred (raw text), occurred_at (ISO, best-effort), location, report_number, description, vehicle, suspects (list of {Age, Height, Sex, Weight, Race, Hair Color, Eye Color, Weapon, Additional Description, ...}), url, text (full cleaned text)`

## Post format quirks

The HTML format changed over the years; the parser handles all of these:

- **~2022+:** `<strong>Label:</strong> value` paragraphs (Incident Description, Reported Offense, Date & Time of Occurrence, Location, Report Number, Vehicle Description), plus one `<table>` per suspect with `Key | Value` rows.
- **~2021:** labels in different wording/case ("Time & date of incident", "LOCATION", "Suspect vehicle:"), sometimes with the value in the following paragraph; dates written like "1:51 p.m. on Aug. 16, 2021".
- **2018–2020:** free-text paragraphs only; report number sometimes appears as "Case #1804045"; some posts cover multiple incidents.
- Every post ends with identical safety boilerplate (starting "If you are in immediate DANGER…", "Please note that race…", "USC Department of Public Safety Recommendations", "TrojansAlert"), which the parser cuts at the first match (`BOILERPLATE` regex).

Coverage across 221 alerts: description 220, location 215, occurred_at 213, suspects 154, report_number 148 — gaps are mostly older posts that genuinely lack the field.

## Safe routing (`safe_route.py`, stdlib only)

- `python3 safe_route.py route --from "USC Village" --to "28th Street & Orchard Avenue" [--time 2026-10-17T23:00] [--safety 1] [--json out.json]` → prints shortest vs safest walk and writes `route_map.html` (Leaflet). Places: `lat,lon`, `Street & Street`, or a name (Nominatim).
- `python3 safe_route.py watch` → samples LA Metro Bike Share every 2 min; live foot-traffic needs ≥4 min of history in the last 90 min.
- `python3 safe_route.py geocode` → `alerts_geocoded.json` (alerts + lat/lng).
- Edge cost = length × (1 + safety × (4·crime risk + 1·darkness + 1·(1−busyness) + 1 if alley)). Crime risk = Gaussian (σ 70 m) sum of alerts × severity × recency (1-yr half-life, floor 0.15) × time-of-day similarity. Busyness = hourly baseline by OSM road class, blended with live signals (bike-share dock moves/hr; BestTime venue busyness if `BESTTIME_API_KEY` is set). Darkness from sun elevation × OSM `lit=*`.
- Geocoding order: address/"N block of" → Census geocoder (block → N+50); two street names → intersection from the OSM graph (names normalized: no W/S prefix, no "USC", Saint→St, Expo→Exposition, fuzzy typos); else Nominatim (1 req/s). ~205/221 alerts locate; failures are Health Sciences Campus (outside the bbox) or vague.
- `.cache/` holds the OSM network, geocodes, bike snapshots, and BestTime venue IDs. Delete `.cache/geocode.json` to re-geocode, or pass `--refresh-map` to re-download OSM. Overpass is often overloaded (502), so the downloader rotates through mirrors.
- Map tiles: tile.openstreetmap.org (CARTO now requires an API key).

## Safety Path app (React frontend + Python backend)

- **The UI is `frontend/`** (React + Vite + Leaflet; design tokens in `frontend/src/styles.css`, PRD + API contract in `frontend/docs/`). `cd frontend && npm run build` → `frontend/dist/`, which `safety_server.py` serves at `/` with SPA fallback. If `dist/` doesn't exist the server falls back to the older `static/` UI.
- `POST /path` (contract in `frontend/docs/API_CONTRACT.md`) → `path_response()` in `safe_route.py`: factors (`lighting_pct` = streetlight within `LIT_RANGE_M`=35 m, `activity_score` from busyness, `resource_proximity_pct` = patrol coverage, `recent_alerts` = DPS+LAPD within 50 m in `ALERT_WINDOW_DAYS`=30), `contract_reasons()`, `fastest_summary()`, `instructions()` (turn left/right from headings measured over ~20 m; same-street steps merged). 422 outside `SERVICE_AREA` (must match `AREA_BOUNDS` in `frontend/src/data/places.js`).
- Frontend dev: `npm run dev` proxies `/path` and `/api` to `127.0.0.1:8000` (vite.config.js). Env: `VITE_USE_MOCK=1` for sample data, `VITE_API_URL` for a remote backend.
- Tracking is real GPS only (the simulated "auto walk" was removed on request): `useTracking.js` = old static/nav.js behaviour — off path >30 m (minus half accuracy) for 10 s → `onOffPath` once per episode → `rerouteFrom()` in App.jsx re-POSTs /path from the fix; wake lock; ignores fixes >50 m accuracy. SOS = `SosSheet` (DPS / 911 / copy location) shared by Home and Tracking.
- Route-preference slider (Recommended screen, 0–2 step 0.25, saved as `safetypath:safety`) → `safety` in POST /path → `path_response(..., safety)`.
- Browser testing tip: override `navigator.geolocation.watchPosition` in page JS to drive fake fixes; Playwright never answers the permission prompt.
- `frontend/src/lib/location.js`: start = GPS if inside the service area, else `CURRENT_LOCATION`; hard 6 s timeout because an unanswered permission prompt never fires the geolocation callbacks.
- Bike-share signals can only *raise* busyness (quiet dock ≠ empty street); BestTime signals blend both ways.
- Map tiles: OSM + `.tiles-dark` CSS filter (CARTO dark tiles need an API key).
- zsh gotcha: `echo =====` fails (equals expansion) — use `echo '---'`.

## Older single-page UI (`static/`) and server details

- `python3 safety_server.py [--host 0.0.0.0 --port 8000]` → stdlib `ThreadingHTTPServer`; loads `RouteEngine` once (~3 s), then serves the UI + `POST /path`, `/api/route`, `/api/geocode`, `/api/health`.
- `RouteEngine` (in `safe_route.py`) combines DPS alerts (×2 weight), LAPD incidents from `usc_crimes_location_time_type.csv` (in-bbox rows only, `LAPD_SEVERITY` table), `streetlights.csv` (from `fetch_streetlights.py`, LA City dataset `twzm-wihy`, ~7.9k poles with watts), and `patrol_zone.json` (an **approximate** rectangle for the DPS UPC patrol area; replace with the real DPS PDF boundary). Edge cost adds `W_UNLIT·(1−lighting)` and `W_OUTSIDE·outside_patrol`. `generate_reasons()` builds the "Why this route?" bullets from recommended-vs-fastest deltas.
- Frontend: `static/index.html`, `app.js` (Leaflet, autocomplete, panel), `nav.js` (live GPS, off-route >30 m for 10 s → reroute, SOS sheet with DPS/911/copy location), `sw.js`, `manifest.webmanifest`, generated icons. `?from=…&to=…` in the URL auto-routes.
- **Cache busting:** static assets are referenced as `?v=N` in `index.html` and in `SHELL` in `sw.js`; bump N and `VERSION` together after editing CSS/JS, or phones keep the old copy.
- **Phone demo:** geolocation and PWA install need HTTPS → `cloudflared tunnel --url http://127.0.0.1:8000`, open the `trycloudflare.com` URL on the phone, Add to Home Screen. URL changes each run.
- PWA limits: GPS stops when the screen locks (iOS especially); wake-lock is requested but unsupported on iOS Safari.

## Possible next steps

- Real DPS patrol polygon; event schedules (Coliseum/BMO/Galen) as busyness spikes; voice turn-by-turn; Capacitor wrap for background GPS.

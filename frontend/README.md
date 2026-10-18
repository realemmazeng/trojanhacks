# Safety Path at USC — frontend

React + Vite + Leaflet. Talks to the Python backend (`safety_server.py` in the repo root).

## Run it
```bash
# terminal 1 — backend on :8000 (from the repo root)
python3 safety_server.py

# terminal 2 — frontend with hot reload
cd frontend
npm install
cp .env.example .env     # optional
npm run dev              # http://localhost:5173; /path and /api are proxied to :8000
```

For a demo or a phone, build once and let the backend serve everything on one port:
```bash
npm run build            # -> frontend/dist, served by safety_server.py at http://127.0.0.1:8000
```

## Screens (flow)
Start → Log in → **tabs** (Home · Friends · Activity · Account)
Home "Where to?" → Search → Recommended → (See details → Why) → Start walking → Tracking → Arrived → saved to Activity

| File | Screen |
|---|---|
| `src/screens/Splash.jsx` | Start |
| `src/screens/Login.jsx` | Log in (v1: no real auth, keeps a display name) |
| `src/screens/Home.jsx` | "Where to?" pill, Later (departure time), recent places |
| `src/screens/Search.jsx` | Free-text destination: suggested/recent places + OpenStreetMap search, service-area check |
| `src/screens/Friends.jsx` | Trusted contacts (family/friends/roommates), add/remove, auto-share |
| `src/screens/Activity.jsx` | Past walks, who they were shared with, walk again |
| `src/screens/Account.jsx` | Profile, settings summary, log out |
| `src/screens/Recommended.jsx` | Recommended vs fastest path, reasons, disclaimer |
| `src/screens/Why.jsx` | Factor comparison, data sources |
| `src/screens/Tracking.jsx` | Live location, next step, off-path alert |
| `src/screens/Arrived.jsx` | Arrived safely ❤️ |

## Backend
`safety_server.py` implements `POST /path` as in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md), plus
`GET /api/geocode` used by place search. Calls go to the same origin by default (Vite proxies them in dev).
- `VITE_API_URL=https://…` — call a backend on another host instead.
- `VITE_USE_MOCK=1` — use `src/mock/mock_path.json` (no backend needed); keep it in sync with the contract.

The walk starts at the phone's GPS position when it's inside the service area (`src/lib/location.js`),
otherwise at the campus stand-in `CURRENT_LOCATION`.

## Tracking modes
`VITE_TRACKING_MODE` in `.env`:
- `simulate` (default) — replays a walk along the path at 20× speed. The sheet shows a
  **Demo: step off the path** button to show the off-path alert on stage.
- `gps` — uses the phone's real location (`navigator.geolocation.watchPosition`).
  Needs HTTPS on a phone: deploy (e.g. Vercel) or tunnel with `ngrok http 5173`.

Off-path rule: more than 30 m from the path for 3 readings in a row. Arrival: within 25 m of the end.
Both are constants at the top of `src/lib/useTracking.js`.

## Local data (v1)
Profile, trusted contacts and walk history are saved in the browser (`localStorage`, see `src/lib/store.js`).
Sharing is UI-only for now: picking contacts records who a walk was shared with, but no message is sent.
To make it real, add a backend endpoint (e.g. `POST /share`) that texts or emails a live-tracking link.

## Destination search
`src/lib/geocode.js` asks the backend's `/api/geocode` first (understands "28th & Orchard", street addresses
and place names), and falls back to OpenStreetMap Nominatim directly in mock mode or if that call fails.
Results are limited to the service area. In mock mode the path itself is always the sample path.

## To replace before a real demo
- `src/data/places.js` — suggested places and the `SERVICE_AREA` outline use real intersection
  coordinates from the walking network. The backend's patrol area (`patrol_zone.json`) is still an
  approximation; replace it with the traced USC DPS patrol polygon.
- Login is a placeholder (USC NetID button skips straight in).

## Design tokens
Colors, type and radii from the Foundation board are CSS variables at the top of `src/styles.css`.
Map tiles: standard OpenStreetMap tiles darkened with the `.tiles-dark` CSS filter (CARTO's dark basemap
now requires an API key). Keep the © OpenStreetMap attribution visible.

## Install to home screen
`public/manifest.webmanifest`, `public/sw.js` and the icons make the built app installable. The service
worker is registered only in production builds (`src/main.jsx`), so `npm run dev` never serves stale code.

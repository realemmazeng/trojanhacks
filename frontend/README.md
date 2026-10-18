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

## Live tracking
Tracking always uses the phone's real location (`navigator.geolocation.watchPosition` in `src/lib/useTracking.js`).
It needs HTTPS on a phone: tunnel the backend (`cloudflared tunnel --url http://127.0.0.1:8000`) or deploy.

- Off-path rule: more than 30 m from the path (minus half the GPS accuracy) for 10 seconds. The app then asks
  the backend for a new path from the current position (`rerouteFrom` in `App.jsx`); "New path from here" does it
  immediately. If the user keeps leaving the new path, the next reroute waits another 10 s.
- Fixes worse than 50 m accuracy are ignored. Arrival: within 25 m of the end. The screen is kept awake via the
  Wake Lock API where supported (not iOS Safari).
- These constants are at the top of `src/lib/useTracking.js`.

## Route preference
The Recommended screen has a Fastest ↔ Safest slider (0–2, steps of 0.25). It re-requests `POST /path` with
`safety` 450 ms after the user stops dragging and is remembered in `localStorage` (`safetypath:safety`).

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

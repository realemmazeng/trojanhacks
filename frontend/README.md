# Safety Path at USC — frontend

React + Vite + Leaflet. Runs fully on mock data until the backend is ready.

## Run it
```bash
cd frontend
npm install
cp .env.example .env     # optional
npm run dev              # http://localhost:5173 (also shown with your LAN IP)
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

## Connecting the backend
1. Backend implements `POST /path` exactly as in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).
2. Set `VITE_API_URL=http://localhost:8000` (or the deployed URL) in `.env`.
3. Restart `npm run dev`. That's it — `src/api.js` switches from mock to real.

The mock response lives in `src/mock/mock_path.json`; keep it in sync with the contract.

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
`src/lib/geocode.js` calls OpenStreetMap Nominatim, bounded to the service area, debounced to ~1 request per
second as its usage policy requires. In mock mode the path itself is always the sample path.

## To replace before a real demo
- `src/data/places.js` — demo places have **approximate** coordinates; swap in real ones
  or a geocoding search. `SERVICE_AREA` is illustrative; replace with the traced USC DPS patrol polygon.
- Login is a placeholder (USC NetID button skips straight in).

## Design tokens
Colors, type and radii from the Foundation board are CSS variables at the top of `src/styles.css`.
Map tiles: CARTO dark basemap (© OpenStreetMap contributors, © CARTO) — keep the attribution visible.

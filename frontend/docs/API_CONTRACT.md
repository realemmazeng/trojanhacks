# Safety Path API contract (v0)

The frontend calls one endpoint. Until `VITE_API_URL` is set, it reads
`src/mock/mock_path.json`, which follows exactly this shape.

## `POST /path`

### Request
```json
{
  "origin":      { "lat": 34.0219, "lng": -118.2836 },
  "destination": { "lat": 34.0333, "lng": -118.2768 },
  "depart_at":   "2026-10-17T21:40",
  "safety":      1
}
```
`depart_at` is local time (America/Los_Angeles), ISO 8601 without offset.
`safety` (optional, default 1) is the route-preference slider: 0 = fastest path only … 2 = avoid risk most.
The response echoes it as `safety`.

### Response
| Field | Type | Used on |
|---|---|---|
| `recommended.minutes` | int | Recommended, Tracking |
| `recommended.distance_m` | int | Tracking |
| `recommended.geometry` | `[[lat, lng], …]` | Recommended map, Tracking |
| `recommended.steps[]` | `{ instruction, distance_m, start_index }` — `start_index` = index in `geometry` where the step begins | Tracking |
| `recommended.factors` | `{ lighting_pct, activity, activity_score, resource_proximity_pct, recent_alerts }` | Why |
| `recommended.reasons[]` | string | Recommended ("Why this path?") |
| `fastest.minutes` | int | Recommended, Why |
| `fastest.geometry` | `[[lat, lng], …]` | Recommended map |
| `fastest.factors` | same shape as above | Why |
| `fastest.summary` | string | Recommended |
| `extra_minutes` | int | Recommended |
| `alert_window_days` | int | Why |
| `data_sources[]` | `{ name, updated_at }` | Why |
| `updated_at` | ISO 8601 | Recommended |
| `disclaimer` | string | Recommended |

Factor meanings (must match the PRD):
- `lighting_pct` — share of the path within range of a streetlight (0–100)
- `activity` / `activity_score` — label ("High" / "Medium" / "Low") and 0–100 score at `depart_at`
- `resource_proximity_pct` — USC Safety Resource Proximity: share of the path inside USC's published patrol area (0–100)
- `recent_alerts` — relevant official alerts near the path in the last `alert_window_days`

### Errors
Non-2xx status with `{ "error": "message" }`. The app shows the message and lets the user retry.

### Backend notes
- Implemented by `safety_server.py` (`path_response()` in `safe_route.py`). CORS is open; in dev, Vite proxies `/path`.
- Start or destination outside the service area (Adams–Jefferson × Vermont–Figueroa) returns 422 with an error message;
  a malformed body returns 400.
- Current values: `alert_window_days` = 30 (DPS alerts + LAPD incidents within 50 m of the path);
  `lighting_pct` = share of the path with a streetlight within 35 m; `activity_score` = time-of-day baseline by
  street type, raised by live LA Metro Bike Share activity (not OSM opening hours yet).
- `steps[].instruction` is generated from street names and turn angles ("Turn left onto University Ave").

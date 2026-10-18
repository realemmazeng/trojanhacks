# Safety Path at USC — PRD

## Product Overview
Safety Path recommends a safety-aware walking path for USC students using lighting, street activity, USC patrol-area coverage, recent official alerts, and travel time.

## Target User
- **Primary user:** USC students walking alone between campus and nearby off-campus destinations.
- **Primary scenario:** A student leaves campus at night and wants a walking path that considers more than travel time.

## Service Area
North University Park: W Adams Blvd to W Jefferson Blvd, S Vermont Ave to S Figueroa St. Destinations outside this area show an out-of-area message.

## Problem Statement
USC students can easily find the fastest walking route, but they cannot easily find one that also considers lighting, street activity, recent safety information, and USC safety coverage.

## Product Hypothesis
If Safety Path recommends one path using relevant and explainable safety factors, USC students will feel more informed and confident when walking near campus at night.

## Value Proposition
Safety Path recommends a walking path based on safety-related factors, not just speed.

## Core User Flow
Log in → Home: "Where to?" (origin = current location) → enter destination → select departure time (Now / Later) → generate path → view the recommended path next to the fastest path → review why ("See details") → Start walking → live tracking with off-path alert → Arrived safely ❤️ (saved to Activity)

## App Structure
- Start → Log in (USC NetID or email; v1 placeholder)
- Bottom tabs: **Home** (Where to?, Later, recent places) · **Friends** (trusted contacts, auto-share) · **Activity** (past walks, Walk again) · **Account** (profile, settings, log out)
- Walk flow: Search → Recommended → Why this path → Tracking → Arrived

## MVP Features

### Must Have
- Origin input (defaults to current location)
- Destination input: free-text search limited to the service area, plus recent and suggested places
- Current or planned departure time
- Walking-path generation; one recommended safety-aware path
- Estimated travel time; path displayed on a map
- Short explanation of why the path was recommended
- Comparison with the fastest available path
- Data source and last-updated information
- Disclaimer that the path does not guarantee safety, directly above "Start walking"

### Could Have (designed and prototyped)
- Route preference: a Fastest ↔ Safest slider on the Recommended screen that re-plans the path
- Live tracking with real GPS: location on the path, remaining time/distance, off-path alert (> 30 m for 10 s) followed by an automatic new path from the current position
- Arrival screen: "Arrived safely ❤️" within 25 m of the destination
- Emergency calling: SOS sheet (USC DPS, 911, copy location link) on Home and Tracking
- Path sharing with friends and family: trusted contacts, auto-share, share picker on Recommended and Tracking
- Activity history: past walks, sharing status, Walk again

### Out of Scope
- Crime prediction
- Special events information (e.g., gameday)
- Turn-by-turn voice navigation

## USC Resource Integration
- USC DPS crime log and crime alerts
- USC DPS published patrol area (University Park)

## Data Sources
| Factor | Source |
|---|---|
| Walking network | OpenStreetMap (OSMnx) |
| Lighting coverage | City of LA streetlight locations |
| Activity level | Proxy: places open at departure time (OSM opening hours) |
| USC Safety Resource Proximity | USC DPS patrol area map, traced as a polygon |
| Recent relevant alerts | USC DPS crime log and alerts (optional: LAPD NIBRS) |
| Walking time | Path length ÷ walking speed |

## Recommendation Output
**Recommended Path: 15 minutes**

Why this path?
- Greater lighting coverage
- More active streets at this time
- More of the path is within USC's published patrol area
- No recent relevant USC alerts directly along the path
- Three minutes longer than the fastest path

## Path Recommendation Logic
Path Utility = Lighting Coverage + Activity Level + USC Safety Resource Proximity − Recent relevant alerts − Additional walking time

- Lighting Coverage: share of the path within range of a streetlight
- Activity Level: street activity at the departure time
- USC Safety Resource Proximity: share of the path inside USC's published patrol area
- Recent relevant alerts: relevant official alerts near the path in the last N days
- Additional walking time: extra minutes versus the fastest path

The fastest path is calculated on distance only and shown for comparison.

## Success Criteria
- Users can explain at least one reason why the path was recommended.
- Users understand the difference in travel time between the fastest path and the recommended path.
- Users understand that the recommended path does not guarantee absolute safety.

## Implementation Notes (v1)
- Frontend: React + Leaflet, runs on mock data until the backend is connected (see `README.md`).
- API: `POST /path` — see `API_CONTRACT.md`.
- Sharing records who a walk was shared with; sending messages needs a backend endpoint.
- Contacts and history are stored on the device in v1.

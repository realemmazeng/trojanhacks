// Stand-in for the user's GPS position on the home screen (demo: USC campus gate).
export const CURRENT_LOCATION = { id: 'current', name: 'Current location', address: 'USC campus · Jefferson & Hoover', lat: 34.0219, lng: -118.2836 };

// Suggested places. Coordinates are approximate — free-text search covers everything else.
export const PLACES = [
  { id: 'adams', name: 'W Adams Blvd & Figueroa', address: 'North University Park', lat: 34.0333, lng: -118.2768 },
  { id: 'hoover28', name: 'W 28th St & S Hoover St', address: 'North University Park', lat: 34.0285, lng: -118.2811 },
  { id: 'vermont30', name: 'W 30th St & S Vermont Ave', address: 'North University Park', lat: 34.0262, lng: -118.2918 },
  { id: 'campus', name: 'USC campus · Jefferson & Hoover', address: 'University Park', lat: 34.0219, lng: -118.2836 },
];

// Service area bounding box (Adams–Jefferson × Vermont–Figueroa, with a little margin).
export const AREA_BOUNDS = { south: 34.0195, north: 34.0355, west: -118.2945, east: -118.2715 };
export const inServiceArea = ({ lat, lng }) =>
  lat >= AREA_BOUNDS.south && lat <= AREA_BOUNDS.north && lng >= AREA_BOUNDS.west && lng <= AREA_BOUNDS.east;

// Approximate street lines, drawn instead of map tiles when tiles can't load
// (VITE_OFFLINE_MAP=1, e.g. inside a sandboxed preview).
export const STREETS = [
  { name: 'W Adams Blvd', major: true, coords: [[34.0332, -118.2960], [34.0335, -118.2700]] },
  { name: 'W 28th St', coords: [[34.0287, -118.2950], [34.0287, -118.2770]] },
  { name: 'W 30th St', coords: [[34.0262, -118.2950], [34.0262, -118.2775]] },
  { name: 'W Jefferson Blvd', major: true, coords: [[34.0216, -118.2960], [34.0216, -118.2740]] },
  { name: 'S Vermont Ave', major: true, coords: [[34.0360, -118.2917], [34.0190, -118.2917]] },
  { name: 'S Hoover St', coords: [[34.0190, -118.2846], [34.0360, -118.2787]] },
  { name: 'S Figueroa St', major: true, coords: [[34.0190, -118.2790], [34.0360, -118.2735]] },
];

// Rough outline of the app's service area (Adams–Jefferson × Vermont–Figueroa).
// Illustrative only — replace with the traced USC DPS patrol-area polygon.
export const SERVICE_AREA = [
  [34.0337, -118.2917],
  [34.0337, -118.2742],
  [34.0217, -118.2780],
  [34.0217, -118.2917],
];

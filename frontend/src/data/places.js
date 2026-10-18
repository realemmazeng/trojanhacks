// Fallback when GPS is unavailable or outside the service area (demo: USC campus gate).
export const CURRENT_LOCATION = { id: 'current', name: 'Current location', address: 'USC campus · Jefferson & Hoover', lat: 34.02372, lng: -118.28404 };

// Suggested places. Coordinates are the street-network intersections used by the backend.
export const PLACES = [
  { id: 'adams', name: 'W Adams Blvd & Figueroa', address: 'North University Park', lat: 34.02816, lng: -118.27602 },
  { id: 'hoover28', name: 'W 28th St & S Hoover St', address: 'North University Park', lat: 34.02915, lng: -118.28396 },
  { id: 'vermont30', name: 'W 30th St & S Vermont Ave', address: 'North University Park', lat: 34.0276, lng: -118.29156 },
  { id: 'campus', name: 'USC campus · Jefferson & Hoover', address: 'University Park', lat: 34.02372, lng: -118.28404 },
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

// Service area outline: the four corner intersections (Adams & Vermont, Adams & Figueroa,
// Jefferson & Figueroa, Jefferson & Vermont). Adams and Jefferson both run diagonally.
export const SERVICE_AREA = [
  [34.03275, -118.29157],
  [34.02816, -118.27602],
  [34.0219, -118.28],
  [34.02549, -118.29155],
];

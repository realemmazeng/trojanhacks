// Free-text place search, limited to the service area.
// With the backend running, /api/geocode understands intersections ("28th & Orchard"), street
// addresses (Census geocoder) and place names (Nominatim). In mock mode, or if the backend
// call fails, we fall back to calling Nominatim directly (max 1 request/second).
import { AREA_BOUNDS } from '../data/places.js';
import { apiUrl, usingMock } from '../api.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const KIND_LABEL = { intersection: 'Intersection', address: 'Address', block: 'Address', place: 'Place', coords: 'Coordinates' };

const inArea = ({ lat, lng }) =>
  lat >= AREA_BOUNDS.south && lat <= AREA_BOUNDS.north && lng >= AREA_BOUNDS.west && lng <= AREA_BOUNDS.east;

async function searchBackend(query, signal) {
  const res = await fetch(apiUrl(`/api/geocode?q=${encodeURIComponent(query)}&limit=5`), { signal });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const rows = await res.json();
  return rows
    .map((r) => ({
      id: `api-${r.kind}-${r.lat.toFixed(5)},${r.lon.toFixed(5)}`,
      name: r.label,
      address: KIND_LABEL[r.kind] || 'North University Park',
      lat: r.lat,
      lng: r.lon,
    }))
    .filter(inArea);
}

async function searchNominatim(query, signal) {
  const { south, north, west, east } = AREA_BOUNDS;
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    bounded: '1',
    viewbox: `${west},${north},${east},${south}`,
  });
  const res = await fetch(`${NOMINATIM}?${params}`, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const rows = await res.json();
  return rows.map((r) => ({
    id: `osm-${r.place_id}`,
    name: r.name || r.display_name.split(',')[0],
    address: r.display_name.split(',').slice(1, 3).join(',').trim(),
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}

export async function searchPlaces(query, signal) {
  try {
    if (!usingMock) {
      try {
        return await searchBackend(query, signal);
      } catch (e) {
        if (e.name === 'AbortError') throw e;
      }
    }
    return await searchNominatim(query, signal);
  } catch {
    return [];
  }
}

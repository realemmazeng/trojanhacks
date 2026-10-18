// Free-text place search with OpenStreetMap Nominatim, limited to the service area.
// Usage policy: max 1 request/second, keep attribution visible. Fails quietly when offline.
import { AREA_BOUNDS } from '../data/places.js';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export async function searchPlaces(query, signal) {
  const { south, north, west, east } = AREA_BOUNDS;
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    bounded: '1',
    viewbox: `${west},${north},${east},${south}`,
  });
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((r) => ({
      id: `osm-${r.place_id}`,
      name: r.name || r.display_name.split(',')[0],
      address: r.display_name.split(',').slice(1, 3).join(',').trim(),
      lat: Number(r.lat),
      lng: Number(r.lon),
    }));
  } catch {
    return [];
  }
}

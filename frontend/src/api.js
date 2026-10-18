import mockPath from './mock/mock_path.json';

// Same origin by default: safety_server.py serves this app and the API together, and in
// `npm run dev` Vite proxies /path and /api to it (see vite.config.js).
// Set VITE_API_URL to call a backend on another host, or VITE_USE_MOCK=1 to stay offline.
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const usingMock = import.meta.env.VITE_USE_MOCK === '1';
export const apiUrl = (path) => `${API_URL}${path}`;

/**
 * Ask the backend for a recommended path and the fastest path.
 * Request and response shapes are documented in docs/API_CONTRACT.md.
 */
export async function getPath({ origin, destination, departAt }) {
  if (usingMock) {
    await new Promise((r) => setTimeout(r, 600)); // feel like a network call
    return mockPath;
  }

  const res = await fetch(apiUrl('/path'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      depart_at: departAt,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Path request failed (${res.status})`);
  }
  return res.json();
}

import mockPath from './mock/mock_path.json';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const usingMock = !API_URL;

/**
 * Ask the backend for a recommended path and the fastest path.
 * Request and response shapes are documented in docs/API_CONTRACT.md.
 */
export async function getPath({ origin, destination, departAt }) {
  if (usingMock) {
    await new Promise((r) => setTimeout(r, 600)); // feel like a network call
    return mockPath;
  }

  const res = await fetch(`${API_URL}/path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      depart_at: departAt,
    }),
  });
  if (!res.ok) throw new Error(`Path request failed (${res.status})`);
  return res.json();
}

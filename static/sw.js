// Safety Path service worker.
// - Precaches the same-origin app shell (HTML/CSS/JS/manifest/icons).
// - Cache-first for versioned static assets (bump ?v= in index.html + SHELL on changes).
// - Network-first for /api/* and page loads so the app always sees fresh content when online.
// - Offline fallback for the HTML shell: lets the UI show the last-route from localStorage.

const VERSION = 'safety-path-v4';
// Only same-origin shell files are precached. Cross-origin assets (Leaflet CDN) are left to the
// browser so Subresource Integrity + CORS keep working; they still get HTTP cached normally.
const SHELL = [
  '/',
  '/static/style.css?v=4',
  '/static/app.js?v=4',
  '/static/nav.js?v=4',
  '/static/icon-192.png',
  '/static/icon-512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Don't touch cross-origin fetches: Leaflet CDN uses SRI + CORS and the browser caches it fine.
  if (url.origin !== self.location.origin) return;

  // Network-first for API and page navigations: always try live, fall back to cache when offline.
  if (url.pathname.startsWith('/api/') || req.mode === 'navigate') {
    ev.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch (err) {
        const cached = await caches.match(req, { ignoreSearch: req.mode === 'navigate' })
          || (req.mode === 'navigate' ? await caches.match('/') : null);
        return cached || new Response(JSON.stringify({ error: 'offline' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  // Cache-first for everything else.
  ev.respondWith((async () => {
    const cached = await caches.match(req, { ignoreVary: true });
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh.ok || fresh.type === 'opaque') {
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (err) {
      // Offline shell fallback for navigation requests.
      if (req.mode === 'navigate') {
        const shell = await caches.match('/');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});

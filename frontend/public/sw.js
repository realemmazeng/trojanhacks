// Safety Path service worker (installed only in production builds; see src/main.jsx).
// - Page loads and API calls: network first, cached copy when offline.
// - Vite's hashed /assets/* files and icons: cache first (their names change when they change).
// - Cross-origin requests (map tiles, Google Fonts) are left to the browser.

const VERSION = 'safety-path-react-v1';

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Only GET is cacheable; POST /path always goes straight to the network.
  if (req.method !== 'GET') return;

  const networkFirst = req.mode === 'navigate' || url.pathname.startsWith('/api/');
  ev.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (networkFirst) {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await cache.match(req, { ignoreSearch: req.mode === 'navigate' }))
          || (req.mode === 'navigate' && (await cache.match('/')))
          || new Response(JSON.stringify({ error: 'You are offline.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    }
    const cached = await cache.match(req);
    if (cached) return cached;
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  })());
});

const CACHE = 'my-money-v8';
const SHELL = ['/', '/style.css', '/app.js', '/logo.png', '/icon-32.png', '/icon-180.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  // Next's hashed JavaScript and CSS are needed to hydrate the cached page offline.
  const page = await (await cache.match('/')).text();
  const assets = [...new Set(page.match(/\/_next\/static\/[^"\s<>?\\]+/g) || [])];
  await cache.addAll(assets);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('my-money-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => { if(event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin || new URL(event.request.url).pathname.startsWith('/api/')) return; event.respondWith(fetch(event.request).then(response => { if(response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); } return response; }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('/') : Response.error())))); });

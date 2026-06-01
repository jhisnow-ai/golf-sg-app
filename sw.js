// Service Worker for Golf SG
// Strategy: cache-first for all app shell assets.
// When we deploy a new version, bump CACHE_NAME so old caches are evicted.

// DEV NOTE: When you edit app files, bump this version string (v1 → v2 etc.)
// so the service worker discards the old cache and re-fetches everything.
// On the phone this is what you want; during local dev just increment on each deploy.
const CACHE_NAME = 'golf-sg-v2';

// Every file the app needs to function offline.
// If you add a new file (e.g. a new JS module), add it here too.
const APP_SHELL = [
  '/golf-sg-app/',
  '/golf-sg-app/index.html',
  '/golf-sg-app/manifest.json',
  '/golf-sg-app/css/app.css',
  '/golf-sg-app/js/db.js',
  '/golf-sg-app/js/app.js',
  '/golf-sg-app/data/courses.json',
  // Dexie loaded from CDN — we cache it on first load so it works offline after that.
  'https://unpkg.com/dexie@3.2.4/dist/dexie.min.js',
];

// INSTALL: pre-cache the app shell.
// waitUntil() keeps the service worker alive until all files are cached.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Skip waiting so the new SW activates immediately (rather than waiting for
  // existing tabs to close).
  self.skipWaiting();
});

// ACTIVATE: delete any caches from old versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of already-open pages without a reload.
  self.clients.claim();
});

// FETCH: serve from cache, fall back to network.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      // Not in cache — try the network and cache the response for next time.
      return fetch(event.request).then((response) => {
        // Only cache successful, non-opaque responses.
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        const toCache = response.clone(); // response body can only be read once
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        return response;
      });
    })
  );
});

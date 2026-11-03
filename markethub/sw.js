const CACHE = 'markethub-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/auth.js',
  './js/cart.js',
  './js/chat.js',
  './js/cloud.js',
  './js/config.js',
  './js/listings-ui.js',
  './js/maps.js',
  './js/nav.js',
  './js/orders.js',
  './js/seller.js',
  './js/state.js',
  './js/utils.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Network-first for API / Supabase, cache-first for app shell
  if (url.origin !== location.origin || url.pathname.includes('/rest/') || url.pathname.includes('/auth/')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

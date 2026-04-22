const CACHE_NAME = 'ganguitas-cache-v3.39';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './js_api.js',
  './js_data.js',
  './js_main.js',
  './js_login.js',
  './js_inventory.js',
  './js_add_item.js',
  './js_financials.js',
  './js_bluetooth.js',
  './js_pos.js',
  './js_scanner.js',
  './Logo-ganguitas.jpg'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Forzar actualización
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim()); // Tomar control de inmediato
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
});

self.addEventListener('fetch', event => {
  // Ignorar peticiones POST (API) y enviarlas directo a red
  if (event.request.method === 'POST') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request);
      })
  );
});

// SNYDER LIVE v1.34 service worker
const CACHE_NAME = "snyder-live-v1-34";
const ASSETS = ['./','./index.html','./styles.css','./app.js','./manifest-live.json','./icon-live-192.png','./icon-live-512.png','./course-whitley-bay.png','./course-tynemouth.svg','./course-quinta-do-lago.png','./course-ombria.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => { if (event.request.method !== 'GET') return; event.respondWith(fetch(event.request).then(response => { const clone = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)); return response; }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))); });

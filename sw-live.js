// SNYDER GOLF v4.93 service worker
const CACHE_NAME = "snyder-golf-v4-93";
const ASSETS = ['./','./index.html','./styles.css','./league-section.js','./app.js','./manifest-live.json','./snyder-golf-logo.png','./snyder-golf-logo-clean.png','./sweepstake-logo.png','./icon-golf-192.png','./icon-golf-512.png','./icon-live-192.png','./icon-live-512.png','./notification-badge-v2.png','./money-fix.js','./course-whitley-bay.png','./course-goswick.png','./course-tynemouth.svg','./course-quinta-do-lago.png','./course-ombria.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isAppScript = url.pathname.endsWith('/app.js') || url.pathname.endsWith('/league-section.js') || url.pathname.endsWith('/money-fix.js');
  if (isAppScript) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./' + url.pathname.split('/').pop()))));
    return;
  }
  event.respondWith(fetch(event.request).then(response => { const clone = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)); return response; }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html'))));
});
async function mutedRoundIds(){
  try{
    const cache=await caches.open(CACHE_NAME);
    const res=await cache.match('./muted-scorecard-notifications.json');
    if(!res)return [];
    const data=await res.json();
    return Array.isArray(data.roundIds)?data.roundIds.map(String):[];
  }catch(e){return [];}
}
self.addEventListener('message', event => {
  const data=event.data||{};
  if(data.type!=='snyder-live-muted-rounds')return;
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put('./muted-scorecard-notifications.json',new Response(JSON.stringify({roundIds:(data.roundIds||[]).map(String)}),{headers:{'Content-Type':'application/json'}}))));
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Snyder Golf', body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async()=>{
  const roundId=(data.roundId)||(data.data&&data.data.roundId);
  const muted=await mutedRoundIds();
  if(roundId&&muted.includes(String(roundId)))return;
  const title = data.title || 'Snyder Golf';
  const options = {
    body: data.body || '',
    icon: data.icon || './icon-golf-192.png',
    badge: './notification-badge-v2.png',
    tag: data.tag || data.type || 'snyder-live',
    renotify: true,
    vibrate: [120, 70, 120],
    timestamp: Date.now(),
    data: data.data || { url: './', app: 'snyder-live' }
  };
  await self.registration.showNotification(title, options);
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ('focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(target);
  }));
});

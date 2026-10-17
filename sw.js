// Service worker: кэширует приложение целиком — работает офлайн после первого открытия
const CACHE = 'shablon-v1';
const ASSETS = [
  './',
  './index.html',
  './data.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'update-cache') {
    // принудительно перекачать все файлы приложения из сети (minache)
    e.waitUntil((async () => {
      const c = await caches.open(CACHE);
      await Promise.all(ASSETS.map(async u => {
        try {
          const r = await fetch(u, { cache: 'reload' });
          if (r && r.ok) await c.put(u, r);
        } catch (err) { /* нет сети — оставляем старую копию */ }
      }));
      const cl = await self.clients.matchAll();
      cl.forEach(client => client.postMessage('cache-updated'));
    })());
  }
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // version.json — всегда из сети: по нему приложение узнаёт о выходе обновления
  if (new URL(e.request.url).pathname.endsWith('version.json')) return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) {
        // фоновое обновление кэша
        fetch(e.request).then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => {
        // офлайн-заглушка index.html — только для переходов по страницам;
        // для картинок и файлов отдаём ошибку, чтобы не подсовывать HTML вместо PNG
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});

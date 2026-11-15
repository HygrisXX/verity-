/* VERITY Service Worker — cache powłoki aplikacji i czytanie offline */
const CACHE_NAME = 'verity-shell-v1';
const CORE_ASSETS = [
  './',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(CORE_ASSETS.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('verity-') && k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  const isDataJson = url.pathname.endsWith('/articles-index.json') || url.pathname.endsWith('/articles.json');
  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  // Dane JSON oraz nawigacja HTML: najpierw sieć (świeże wiadomości co godzinę), przy braku sieci pamięć podręczna
  if (isDataJson || isNav) {
    event.respondWith(
      fetch(req)
        .then(resp => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match(req).then(hit => hit || (isNav ? caches.match('./') : undefined)))
    );
    return;
  }

  // Statyczne zasoby powłoki (styles.css?v=..., app.js?v=..., ikony): stale-while-revalidate
  event.respondWith(
    caches.match(req).then(cached => {
      const netPromise = fetch(req).then(resp => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => cached);
      return cached || netPromise;
    })
  );
});

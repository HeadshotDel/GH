// Офлайн-кэш. Версию поднимать при каждом изменении файлов —
// иначе на телефоне останется старая сборка.
const CACHE = 'ah-v3';
const ASSETS = [
  './',
  'index.html',
  'app.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/game.js',
  'js/ui.js',
  'js/render.js',
  'js/physics.js',
  'js/input.js',
  'js/themes.js',
  'js/audio.js',
  'js/haptics.js',
  'js/device.js',
  'js/settings.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Сначала сеть, при неудаче — кэш: так обновления приезжают сразу,
// а без интернета игра всё равно запускается.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('index.html')))
  );
});

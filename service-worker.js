// service-worker.js — 앱 셸 오프라인 캐시(PWA)
const CACHE = 'francha-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/base.css',
  './styles/board.css',
  './styles/cards.css',
  './styles/animations.css',
  './js/main.js',
  './js/engine.js',
  './js/state.js',
  './js/config.js',
  './js/cards.js',
  './js/abilities.js',
  './js/animation.js',
  './js/ai.js',
  './js/ui.js',
  './js/onboarding.js',
  './js/replay.js',
  './js/theater.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 캐시 우선, 없으면 네트워크(오프라인 플레이 지원)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});

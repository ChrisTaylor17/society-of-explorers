const CACHE_NAME = 'soe-v3';
const STATIC_ASSETS = [
  '/',
  '/labyrinth',
  '/join',
  '/manifest.json',
];
const CACHEABLE_DESTINATIONS = new Set([
  'style',
  'script',
  'worker',
  'image',
  'font',
  'audio',
  'video',
]);

function isCacheableRequest(request) {
  if (request.method !== 'GET') return false;
  if (request.mode === 'navigate') return false;
  if (request.url.includes('/api/')) return false;
  if (!CACHEABLE_DESTINATIONS.has(request.destination)) return false;
  if (request.headers.has('authorization')) return false;
  if (request.headers.has('range')) return false;

  const url = new URL(request.url);

  // Avoid persisting third-party and signed asset URLs on member devices.
  if (url.origin !== self.location.origin) return false;
  if (url.search) return false;

  return true;
}

function isCacheableResponse(response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return false;

  const cacheControl = (response.headers.get('cache-control') || '').toLowerCase();
  if (
    cacheControl.includes('no-store') ||
    cacheControl.includes('no-cache') ||
    cacheControl.includes('private')
  ) {
    return false;
  }

  if (response.headers.has('set-cookie')) return false;

  return true;
}

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fall back to cache
self.addEventListener('fetch', (event) => {
  if (!isCacheableRequest(event.request)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (isCacheableResponse(response)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Society of Explorers', {
      body: data.body || 'You have a new message',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/salon' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/salon')
  );
});

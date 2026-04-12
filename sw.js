const CACHE_NAME = 'operator-logbook-v5';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/i18n.js',
  './js/firebase-config.js',
  './js/db.js',
  './js/auth.js',
  './js/dashboard.js',
  './js/table.js',
  './js/editor.js',
  './js/zones.js',
  './js/settings.js',
  './js/admin.js',
  './js/guide.js',
  './js/app.js',
  './icon-512.png'
];

// External CDN resources to cache for offline support
const CDN_ASSETS = [
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-storage-compat.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('Caching local assets');
      await cache.addAll(ASSETS);

      // Cache CDN assets individually (don't fail install if one CDN is down)
      for (const url of CDN_ASSETS) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn('Failed to cache CDN asset:', url, e);
        }
      }
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate Event (Cleanup old caches)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Claim clients immediately
  self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests
  if (event.request.method !== 'GET') return;

  // Let Firebase SDK handle its own API requests
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('firebaseio.com') ||
      event.request.url.includes('firebasestorage.googleapis.com') ||
      event.request.url.includes('identitytoolkit.googleapis.com') ||
      event.request.url.includes('securetoken.googleapis.com')) {
    return;
  }

  // For Google Fonts woff2 files, use cache-first (they never change)
  if (event.request.url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // For CDN scripts & fonts CSS: stale-while-revalidate
  const isCDN = CDN_ASSETS.some(cdnUrl => event.request.url.startsWith(cdnUrl));
  if (isCDN) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Local assets: Network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          
          // If both fail and it's a page navigation, return index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return null;
        });
      })
  );
});

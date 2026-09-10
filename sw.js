// Service Worker - Dashboard Financeiro Pessoal PWA
// Versão do Cache
const CACHE_NAME = 'financas-pwa-v1';

// Recursos essenciais da interface (App Shell)
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './src/core/dateUtils.js',
  './src/core/formatters.js',
  './src/core/security.js',
  './src/core/textUtils.js',
  './src/services/authService.js',
  './src/services/catalogsService.js',
  './src/services/creditSettlementService.js',
  './src/services/metasService.js',
  './src/services/supabaseClient.js',
  './src/services/transactionsService.js',
  './src/store/state.js'
];

// Instalação: pré-carrega os arquivos da interface
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Ativação: remove caches antigos e assume controle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. REGRAS DE SEGURANÇA E PRIVACIDADE CRÍTICAS:
  // NUNCA cachear chamadas Supabase, APIs, autenticação, tokens ou requisições POST/PUT/DELETE
  if (request.method !== 'GET') {
    return;
  }

  if (
    url.origin.includes('supabase.co') ||
    url.pathname.includes('/auth/') ||
    url.pathname.includes('/rest/v1/') ||
    url.protocol.startsWith('chrome-extension')
  ) {
    // Pass-through direto para a rede sem passar pelo cache storage
    return;
  }

  // 2. NAVEGAÇÃO / HTML PRINCIPAL (Network-First com fallback para cache):
  // Evita que o usuário fique preso em uma versão desatualizada após novo deploy
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match('./index.html') || caches.match('./');
          });
        })
    );
    return;
  }

  // 3. ASSETS ESTÁTICOS LOCAIS / SHELL (Stale-While-Revalidate):
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 4. CDNs ESTÁTICOS EXTERNOS (Google Fonts, CDN Chart.js / Supabase SDK - Stale-While-Revalidate seguro):
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }
});

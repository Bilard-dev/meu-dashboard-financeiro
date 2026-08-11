self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // Pass-through de rede para garantir sincronização ao vivo
});

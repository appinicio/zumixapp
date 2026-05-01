// ── Zumix Stock — Service Worker ─────────────────────────────────────────────
// Versión: incrementar este número cada vez que se actualice el SW
const CACHE_NAME = 'zumix-v1';
const BASE_URL   = '/zumixapp/';

// Archivos a cachear para modo offline básico
const PRECACHE = [
  BASE_URL,
  BASE_URL + 'index.html',
  'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap'
];

// ── INSTALACIÓN ───────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVACIÓN (limpia caches viejos) ─────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH (red primero, caché como respaldo) ──────────────────────────────────
self.addEventListener('fetch', event => {
  // Solo interceptar peticiones GET al mismo origen o fuentes de la app
  if (event.request.method !== 'GET') return;

  // Firebase y Google APIs: siempre red (datos en tiempo real)
  const url = event.request.url;
  if (
    url.includes('firebaseio.com') ||
    url.includes('googleapis.com') ||
    url.includes('gstatic.com')
  ) {
    return; // dejar pasar sin interceptar
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Guardar copia en caché si la respuesta es válida
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── RECORDATORIO EN SEGUNDO PLANO ─────────────────────────────────────────────
// El SW verifica la hora cada vez que recibe un mensaje 'CHECK_REMINDER'
// desde la app. Esto permite que funcione aunque la pestaña esté en segundo plano.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CHECK_REMINDER') {
    const { active, time, firedKey } = event.data;
    if (!active || !time) return;

    const now  = new Date();
    const [hh, mm] = time.split(':').map(Number);
    const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

    if (
      now.getHours()   === hh &&
      now.getMinutes() === mm &&
      firedKey !== todayKey
    ) {
      // Notificar a la app que dispare el recordatorio y marque el día
      event.source?.postMessage({ type: 'REMINDER_FIRE', todayKey });

      // Mostrar notificación del sistema (funciona aunque la pestaña esté cerrada)
      self.registration.showNotification('🧃 Zumix Stock', {
        body: '¡Hora de revisar los registros del día!',
        icon: BASE_URL + 'icons/icon-192.png',
        badge: BASE_URL + 'icons/icon-192.png',
        tag: 'zumix-reminder',       // evita duplicados
        renotify: false,
        requireInteraction: false
      });
    }
  }
});

// ── CLIC EN NOTIFICACIÓN → abrir la app ──────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Si la app ya está abierta, enfocarla
        for (const client of clientList) {
          if (client.url.includes('/zumixapp/') && 'focus' in client) {
            return client.focus();
          }
        }
        // Si no está abierta, abrirla
        if (clients.openWindow) {
          return clients.openWindow(BASE_URL);
        }
      })
  );
});

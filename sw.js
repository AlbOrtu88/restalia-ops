// Service worker: guarda la app en el dispositivo para abrirla sin conexión.
// Solo cachea los archivos propios de la app. Nunca cachea llamadas al backend.
const VERSION = 'restalia-v0.2.0';
const SHELL = [
  './',
  "./css/app.css",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./index.html",
  "./js/adapters/ai.js",
  "./js/adapters/backend.js",
  "./js/adapters/graph.js",
  "./js/adapters/index.js",
  "./js/adapters/notifications.js",
  "./js/adapters/notion.js",
  "./js/adapters/storage.js",
  "./js/app.js",
  "./js/core/charts.js",
  "./js/core/i18n.js",
  "./js/core/insights.js",
  "./js/core/media.js",
  "./js/core/store.js",
  "./js/core/sync.js",
  "./js/core/ui.js",
  "./js/core/utils.js",
  "./js/data/demo.js",
  "./js/modules/agenda.js",
  "./js/modules/aprobaciones.js",
  "./js/modules/asistente.js",
  "./js/modules/auditorias.js",
  "./js/modules/automatizaciones.js",
  "./js/modules/comunicaciones.js",
  "./js/modules/configuracion.js",
  "./js/modules/documentacion.js",
  "./js/modules/incidencias.js",
  "./js/modules/informes.js",
  "./js/modules/inicio.js",
  "./js/modules/locales.js",
  "./js/modules/proyectos.js",
  "./js/modules/tareas.js",
  "./js/modules/visitas.js",
  "./manifest.webmanifest",
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // backend y terceros: siempre red
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') return; // backend en el mismo origen: nunca se cachea
  // Navegación: red primero (para recibir versiones nuevas), caché si no hay conexión.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('./', copy)); return r; }).catch(() => caches.match('./')));
    return;
  }
  // Archivos de la app: caché primero, actualizando en segundo plano.
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});

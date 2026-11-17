// Notificaciones. Locales (en la propia app) ya funcionan; las push en iPhone requieren
// la app instalada en pantalla de inicio (iOS 16.4+) y un backend con Web Push (claves VAPID).
import { request } from './backend.js';
export const notificationsAdapter = {
  id: 'notifications', name: 'Notificaciones', layer: 'E',
  description: 'Avisos de tareas vencidas, incidencias críticas y aprobaciones pendientes.',
  requires: ['Backend con Web Push (claves VAPID)', 'App instalada en la pantalla de inicio (iOS 16.4 o posterior)'],
  supported: () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window,
  permission: () => ('Notification' in window ? Notification.permission : 'unsupported'),
  async askPermission() { if (!('Notification' in window)) return 'unsupported'; return Notification.requestPermission(); },
  subscribe: (sub) => request('/push/subscribe', { method: 'POST', body: sub, system: 'Notificaciones' }),
};

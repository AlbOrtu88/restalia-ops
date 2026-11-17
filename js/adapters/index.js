// Registro de adaptadores. La interfaz no depende de ningún proveedor concreto.
import { notion } from './notion.js';
import { graph } from './graph.js';
import { aiAdapter } from './ai.js';
import { storageAdapter } from './storage.js';
import { notificationsAdapter } from './notifications.js';
import { health, backendConfigured } from './backend.js';

export const ADAPTERS = [notion, graph, aiAdapter, storageAdapter, notificationsAdapter];

/** Estado real de cada integración. Nunca se marca "conectado" sin comprobarlo contra el backend. */
export async function connectionStatus() {
  const h = backendConfigured() ? await health() : null;
  return {
    backend: backendConfigured() ? (h ? 'ok' : 'error') : 'off',
    notion: h?.notion ? 'ok' : 'off',
    graph: h?.graph ? 'ok' : 'off',
    ai: h?.ai ? 'ok' : 'off',
    storage: h?.storage ? 'ok' : 'local',
    notifications: h?.push ? 'ok' : 'off',
  };
}
export { notion, graph, aiAdapter, storageAdapter, notificationsAdapter };

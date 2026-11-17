// Servicio de almacenamiento de evidencias (fotos de visitas, auditorías e incidencias).
// Hoy: IndexedDB en este dispositivo. Cloud: subida al backend (p. ej. SharePoint o Blob Storage).
import { request } from './backend.js';
export const storageAdapter = {
  id: 'storage', name: 'Almacenamiento de evidencias', layer: 'C',
  description: 'Fotos y adjuntos. Ahora se guardan solo en este dispositivo.',
  requires: ['Backend con endpoint /files', 'Ubicación destino acordada (SharePoint o almacenamiento propio)'],
  upload: (name, dataUrl) => request('/files', { method: 'POST', body: { name, dataUrl }, system: 'Almacenamiento' }),
};

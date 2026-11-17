// Adaptador Notion (capa A · datos operativos).
// Solo lectura + propuestas de escritura que pasan por Aprobaciones.
// Los IDs y el mapeo de propiedades los entregará ChatGPT (ver docs/para-chatgpt.md).
import { request } from './backend.js';

/** Mapa colección de la app → base de datos de Notion. databaseId: pendiente de recibir. */
export const NOTION_DATABASES = {
  locales:      { name: 'Locales', databaseId: null },
  visitas:      { name: 'Visitas', databaseId: null },
  incidencias:  { name: 'Incidencias', databaseId: null },
  tareas:       { name: 'Acciones y seguimientos', databaseId: null },
  contactos:    { name: 'Contactos', databaseId: null },
  asistente:    { name: 'Registro del asistente IA', databaseId: null },
  aprobaciones: { name: 'Bandeja de aprobaciones', databaseId: null },
  actividad:    { name: 'Historial de cambios', databaseId: null },
  eventos:      { name: 'Agenda Restalia', databaseId: null },
};

/** Mapeo propiedad Notion → campo de la app. Se completará con los esquemas reales. */
export const PROPERTY_MAP = {
  locales: { nombre: null, marca: null, codigo: null, direccion: null, ciudad: null, responsable: null, estado: null, apertura: null },
  visitas: { localId: null, fecha: null, motivo: null, objetivo: null, observaciones: null, resultado: null, responsable: null, seguimiento: null },
  incidencias: { titulo: null, localId: null, categoria: null, descripcion: null, prioridad: null, estado: null, responsable: null, fecha: null, limite: null },
  tareas: { titulo: null, descripcion: null, responsable: null, prioridad: null, estado: null, limite: null, proyectoId: null, localId: null },
};

export const notion = {
  id: 'notion',
  name: 'Notion',
  layer: 'A',
  description: 'Fuente principal de datos operativos: locales, visitas, incidencias, acciones, contactos, aprobaciones, historial y Agenda Restalia.',
  requires: ['IDs de las 8 bases de datos y de Agenda Restalia', 'Esquema de propiedades de cada base', 'Token de la integración guardado en el backend (nunca en el navegador)'],
  isConfigured: () => Object.values(NOTION_DATABASES).every((d) => d.databaseId),
  /** Devuelve registros ya normalizados al formato de la app, con source={system:'notion', ref: pageId} */
  async list(collection, { since } = {}) {
    const db = NOTION_DATABASES[collection];
    if (!db?.databaseId) throw new Error(`Notion: falta el ID de la base «${db?.name || collection}»`);
    return request(`/notion/${collection}?since=${encodeURIComponent(since || '')}`, { system: 'Notion' });
  },
  /** Escritura: solo la ejecuta Aprobaciones tras aprobar. */
  async write(collection, op, payload) {
    return request(`/notion/${collection}`, { method: op === 'create' ? 'POST' : 'PATCH', body: payload, system: 'Notion' });
  },
};

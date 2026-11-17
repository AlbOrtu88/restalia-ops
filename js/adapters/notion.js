// Adaptador Notion (capa A · datos operativos).
// Solo lectura + propuestas de escritura que pasan por Aprobaciones.
// Los IDs de las fuentes de datos y el token viven en el backend (secretos de Cloudflare), nunca en este repositorio.
// El mapeo propiedad → campo está en worker/src/notion.js y se comprueba contra el esquema real (Configuración → Esquema real de Notion).
import { request } from './backend.js';

/** Colecciones de la app que vienen de Notion (bases del proyecto Restalia Operations). */
export const NOTION_DATABASES = {
  locales:      { name: 'Locales' },
  visitas:      { name: 'Visitas' },
  incidencias:  { name: 'Incidencias' },
  tareas:       { name: 'Acciones y seguimientos' },
  contactos:    { name: 'Contactos' },
  aprobaciones: { name: 'Bandeja de aprobaciones' },
  historial:    { name: 'Historial de cambios' },
  registroIA:   { name: 'Registro del asistente IA' },
  agenda:       { name: 'Agenda Restalia' },
};

export const notion = {
  id: 'notion',
  name: 'Notion',
  layer: 'A',
  description: 'Fuente principal de datos operativos: locales, visitas, incidencias, acciones, contactos, aprobaciones, historial y Agenda Restalia.',
  requires: ['Integración interna de Notion con las 9 bases compartidas', 'Token guardado como secreto en el backend (nunca en el navegador)'],
  /** Registros ya normalizados al formato de la app, con source={system:'notion', ref: pageId}. */
  list: (collection) => request(`/notion/${collection}`, { system: 'Notion' }),
  /** Esquema real de cada base y su mapeo con la app. */
  schema: () => request('/notion/schema', { system: 'Notion', timeout: 45000 }),
};

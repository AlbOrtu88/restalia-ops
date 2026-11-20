// Gestión de estado y persistencia local.
// Capas de datos (punto 18 del encargo):
//   A · Operativo (Notion)        B · Corporativo (Microsoft 365)
//   C · Auxiliar de la app        D · Memoria del asistente       E · Configuración
// Cada registro lleva `source: { system, ref }` con su sistema de origen y su id allí.
import { uid, relDate } from './utils.js';
import { buildDemo } from '../data/demo.js';

export const SCHEMA = {
  locales:          { layer: 'A', system: 'notion', origin: 'Notion · Locales', label: 'Locales', readOnly: true },
  visitas:          { layer: 'A', system: 'notion', origin: 'Notion · Visitas', label: 'Visitas' },
  incidencias:      { layer: 'A', system: 'notion', origin: 'Notion · Incidencias', label: 'Incidencias' },
  tareas:           { layer: 'A', system: 'notion', origin: 'Notion · Acciones y seguimientos', label: 'Tareas y acciones' },
  contactos:        { layer: 'A', system: 'notion', origin: 'Notion · Contactos', label: 'Contactos', readOnly: true },
  aprobaciones:     { layer: 'A', system: 'notion', origin: 'Notion · Bandeja de aprobaciones', label: 'Aprobaciones' },
  actividad:        { layer: 'A', system: 'notion', origin: 'Notion · Historial de cambios', label: 'Historial de cambios' },
  eventos:          { layer: 'A+B', system: 'notion|graph', origin: 'Notion · Agenda Restalia + Outlook Calendar', label: 'Agenda' },
  mensajes:         { layer: 'B', system: 'graph', origin: 'Outlook + Teams (Microsoft Graph)', label: 'Comunicaciones', readOnly: true },
  documentos:       { layer: 'B', system: 'graph', origin: 'SharePoint + OneDrive (Microsoft Graph)', label: 'Documentos', readOnly: true },
  auditorias:       { layer: 'C', system: 'app', origin: 'App (sin base en Notion identificada aún)', label: 'Auditorías' },
  proyectos:        { layer: 'C', system: 'app', origin: 'App (pendiente de confirmar fuente)', label: 'Proyectos' },
  automatizaciones: { layer: 'C', system: 'app', origin: 'App', label: 'Automatizaciones' },
  plantillas:       { layer: 'C', system: 'app', origin: 'App · plantillas de auditoría', label: 'Plantillas de auditoría' },
};
export const COLLECTIONS = Object.keys(SCHEMA);

const DATA_KEY = 'restalia.data.v1';
const SET_KEY = 'restalia.settings';
const AI_KEY = 'restalia.assistant.v1';
const SEED_VERSION = 1;

const DEFAULT_SETTINGS = {
  theme: 'auto', lang: 'es', userName: 'Alberto', company: 'Restalia',
  backendUrl: '', aiProvider: 'auto', aiModel: '', showDemo: true, seedVersion: 0, settingsVersion: 2,
  syncCursor: null, lastSync: null, demoAutoHidden: false,
};

const safe = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.warn('Almacenamiento lleno o bloqueado', e); return false; } } };

let data = {};
let settings = {};
let assistant = { conversations: [], memory: [] };
const listeners = new Set();

export const DEFAULT_TEMPLATES = [
  { id: 'tpl-operaciones', categoria: 'Operaciones', items: ['Apertura y cierre según procedimiento', 'Cuadrante de personal publicado', 'Control de caja y arqueo', 'Registro de temperaturas al día'] },
  { id: 'tpl-servicio', categoria: 'Servicio', items: ['Tiempo de espera en barra < 5 min', 'Saludo y despedida al cliente', 'Uniformidad completa', 'Gestión de reclamaciones'] },
  { id: 'tpl-producto', categoria: 'Producto', items: ['Fichas técnicas visibles', 'Gramajes correctos', 'Presentación según estándar', 'Rotación FIFO en cámara'] },
  { id: 'tpl-limpieza', categoria: 'Limpieza', items: ['Plan de limpieza firmado', 'Baños revisados en la última hora', 'Cocina y campanas limpias', 'Sala y terraza sin residuos'] },
  { id: 'tpl-seguridad', categoria: 'Seguridad alimentaria', items: ['APPCC actualizado', 'Alérgenos informados en carta', 'Etiquetado de producto abierto', 'Separación crudo/cocinado'] },
  { id: 'tpl-prl', categoria: 'PRL', items: ['Extintores revisados', 'Botiquín completo', 'Salidas de emergencia despejadas', 'EPIs disponibles'] },
  { id: 'tpl-formacion', categoria: 'Formación', items: ['Plan de acogida aplicado', 'Formación en alérgenos vigente', 'Manual de marca accesible'] },
  { id: 'tpl-imagen', categoria: 'Imagen de marca', items: ['Rótulos y cartelería en buen estado', 'Promociones vigentes expuestas', 'Música e iluminación según estándar'] },
  { id: 'tpl-procedimientos', categoria: 'Cumplimiento de procedimientos', items: ['Checklists diarios completados', 'Pedidos según calendario', 'Comunicaciones de central leídas'] },
];

function tag(rec, system = 'demo') {
  return { ...rec, demo: system === 'demo', source: { system, ref: rec.id } };
}

function seedDemo() {
  const demo = buildDemo(relDate);
  const out = {};
  for (const c of COLLECTIONS) out[c] = (demo[c] || []).map((r) => tag(r));
  out.contactos = out.contactos || [];
  out.plantillas = DEFAULT_TEMPLATES.map((t) => ({ ...t, demo: false, source: { system: 'app', ref: t.id } }));
  return out;
}

export function init() {
  const saved = safe.get(SET_KEY) || {};
  settings = { ...DEFAULT_SETTINGS, ...saved };
  // v2: el proveedor de IA por defecto pasa a «el que tenga el backend» (antes «ninguno» era solo el valor inicial).
  if ((saved.settingsVersion || 1) < 2) { if (settings.aiProvider === 'none') settings.aiProvider = 'auto'; settings.settingsVersion = 2; }
  data = safe.get(DATA_KEY);
  if (!data || settings.seedVersion !== SEED_VERSION) {
    data = seedDemo();
    settings.seedVersion = SEED_VERSION;
    persist();
  }
  for (const c of COLLECTIONS) data[c] ||= [];
  if (!data.plantillas.length) data.plantillas = seedDemo().plantillas;
  assistant = safe.get(AI_KEY) || { conversations: [], memory: [] };
}

function persist() { safe.set(DATA_KEY, data); safe.set(SET_KEY, settings); }
const persistAI = () => safe.set(AI_KEY, assistant);
function emit(col) { persist(); listeners.forEach((fn) => fn(col)); }
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// ---------- Consultas ----------
export const all = (col) => {
  const list = (data[col] || []).filter((r) => !r.hidden); // hidden: duplicado de otra fuente (p. ej. evento en Notion y Outlook)
  return settings.showDemo ? list : list.filter((r) => !r.demo);
};
export const find = (col, id) => (data[col] || []).find((r) => r.id === id);
export const localName = (id) => find('locales', id)?.nombre ?? '—';
export const projectName = (id) => find('proyectos', id)?.nombre ?? '—';

// ---------- Escrituras (siempre locales; la sincronización externa pasa por Aprobaciones) ----------
export function add(col, rec, { prefix } = {}) {
  const r = { id: rec.id || uid(prefix || col.slice(0, 3)), ...rec, demo: rec.derivedFromDemo === true, source: { system: 'local', ref: null }, createdAt: new Date().toISOString() };
  data[col].unshift(r);
  emit(col);
  return r;
}
// Campos de registros de Notion cuyo cambio en la app se propone a Notion (vía Aprobaciones). Coincide con WRITABLE del backend.
const NOTION_WRITABLE = { locales: ['estado', 'proximaVisita', 'notasGenerales'], tareas: ['estado', 'limite', 'descripcion', 'evidencia'], incidencias: ['estado', 'accion'], visitas: ['estado', 'observaciones', 'resultado'] };

export function update(col, id, patch) {
  const i = data[col].findIndex((r) => r.id === id);
  if (i < 0) return null;
  const before = data[col][i];
  data[col][i] = { ...before, ...patch, updatedAt: new Date().toISOString() };
  // Registro real de Notion: el cambio se queda en la app y se crea una propuesta para escribirlo en Notion.
  if (before.source?.system === 'notion' && NOTION_WRITABLE[col]) {
    const changes = Object.fromEntries(Object.entries(patch).filter(([k, v]) => NOTION_WRITABLE[col].includes(k) && v !== before[k]));
    if (Object.keys(changes).length) proposeNotionChange(col, before, changes);
  }
  emit(col);
  return data[col][i];
}

function proposeNotionChange(col, rec, changes) {
  const base = { locales: 'Locales', tareas: 'Acciones y seguimientos', incidencias: 'Incidencias', visitas: 'Visitas' }[col];
  const title = rec.titulo || rec.nombre || rec.id;
  // Si ya hay una propuesta pendiente para el mismo registro, se actualiza en lugar de duplicarla.
  const prev = data.aprobaciones.find((a) => a.estado === 'Pendiente' && a.op?.ref === rec.source.ref);
  const merged = { ...(prev?.op?.changes || {}), ...changes };
  const datos = { Base: base, Registro: title, ...Object.fromEntries(Object.entries(merged).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), `${rec[k] ?? '—'} → ${v}`])) };
  const fields = { accion: `Actualizar «${title}» en Notion`, sistema: 'Notion', motivo: 'Cambio hecho en la app sobre un registro sincronizado de Notion', datos,
    resultado: `Se modificará la página en «${base}» y se anotará en Historial de cambios.`, op: { type: 'notion.update', collection: col, ref: rec.source.ref, changes: merged, baseEditedAt: prev?.op?.baseEditedAt || rec.notionEditedAt || rec.source.updatedAt || null }, refUrl: rec.url || null };
  if (prev) Object.assign(prev, fields);
  else data.aprobaciones.unshift({ id: uid('apr'), ...fields, estado: 'Pendiente', creada: new Date().toISOString(), origen: 'Cambio en la app', historial: [], demo: false, source: { system: 'local', ref: null } });
}
export function remove(col, id) {
  data[col] = data[col].filter((r) => r.id !== id);
  emit(col);
}
export function log(texto, modulo, ref = null) {
  data.actividad.unshift({ id: uid('act'), fecha: new Date().toISOString(), texto, modulo, ref, demo: false, source: { system: 'local', ref: null } });
  data.actividad = data.actividad.slice(0, 300);
  emit('actividad');
}
export function nextIncidentId() {
  const n = (data.incidencias || []).map((i) => parseInt(String(i.id).replace(/\D/g, ''), 10) || 0);
  return `INC-${String(Math.max(0, ...n) + 1).padStart(4, '0')}`;
}

// ---------- Configuración (capa E) ----------
export const getSettings = () => settings;
export function setSettings(patch) { settings = { ...settings, ...patch }; persist(); listeners.forEach((fn) => fn('settings')); }

// ---------- Memoria del asistente (capa D) ----------
export const ai = {
  conversations: () => assistant.conversations,
  get: (id) => assistant.conversations.find((c) => c.id === id),
  create(title = 'Nueva conversación', projectId = null) {
    const c = { id: uid('conv'), title, projectId, messages: [], createdAt: new Date().toISOString() };
    assistant.conversations.unshift(c); persistAI(); return c;
  },
  push(id, msg) { const c = ai.get(id); if (!c) return; c.messages.push({ ...msg, at: new Date().toISOString() }); c.updatedAt = msg.at; persistAI(); },
  update(id, patch) { Object.assign(ai.get(id) || {}, patch); persistAI(); },
  remove(id) { assistant.conversations = assistant.conversations.filter((c) => c.id !== id); persistAI(); },
  memory: () => assistant.memory,
  remember(text) { assistant.memory.unshift({ id: uid('mem'), text, at: new Date().toISOString() }); persistAI(); },
  forget(id) { assistant.memory = assistant.memory.filter((m) => m.id !== id); persistAI(); },
};

// ---------- Mantenimiento ----------
export function stats() {
  const out = {};
  for (const c of COLLECTIONS) {
    const l = data[c] || [];
    out[c] = { total: l.length, demo: l.filter((r) => r.demo).length, local: l.filter((r) => r.source?.system === 'local').length };
  }
  let bytes = 0;
  try { bytes = (localStorage.getItem(DATA_KEY) || '').length + (localStorage.getItem(AI_KEY) || '').length; } catch {}
  return { collections: out, bytes };
}
export function exportAll() { return JSON.stringify({ app: 'restalia-operations-ai', version: SEED_VERSION, exportedAt: new Date().toISOString(), settings, data, assistant }, null, 2); }
export function importAll(json) {
  const o = JSON.parse(json);
  if (o.app !== 'restalia-operations-ai' || !o.data) throw new Error('El archivo no es una copia de Restalia Operations AI.');
  data = o.data; settings = { ...DEFAULT_SETTINGS, ...o.settings, syncCursor: null }; assistant = o.assistant || assistant;
  persist(); persistAI(); listeners.forEach((fn) => fn('*'));
}
export function resetDemo() { data = seedDemo(); settings.syncCursor = null; persist(); listeners.forEach((fn) => fn('*')); }
export function removeDemo() { for (const c of COLLECTIONS) data[c] = (data[c] || []).filter((r) => !r.demo); persist(); listeners.forEach((fn) => fn('*')); }
export function wipe() { data = Object.fromEntries(COLLECTIONS.map((c) => [c, []])); data.plantillas = seedDemo().plantillas; settings.syncCursor = null; assistant = { conversations: [], memory: [] }; persist(); persistAI(); listeners.forEach((fn) => fn('*')); }

/**
 * Fusión sin duplicados: integra registros del backend por la pareja (sistema, ref). Ver js/core/sync.js.
 * Nunca toca registros DEMO ni locales. Devuelve el número de cambios por colección.
 */
export function applyRemote(records) {
  const touched = {};
  const index = {};
  for (const r of records) {
    if (!SCHEMA[r.collection]) continue; // colecciones solo del backend (p. ej. registroIA)
    const col = r.collection;
    if (!index[col]) { index[col] = new Map(); (data[col] || []).forEach((x, i) => { if (x.source && x.source.system !== 'local' && x.source.system !== 'demo' && x.source.system !== 'app') index[col].set(`${x.source.system}|${x.source.ref}`, i); }); }
    const key = `${r.system}|${r.ref}`;
    const i = index[col].get(key);
    if (r.deleted) { if (i != null) { data[col][i] = null; touched[col] = (touched[col] || 0) + 1; } continue; }
    const rec = { ...r.data, id: r.data.id || r.ref, demo: false, source: { system: r.system, ref: r.ref, updatedAt: r.updatedAt, syncedAt: r.syncedAt } };
    // Las notas de Alberto sobre un local son solo de este dispositivo: la sincronización no las borra.
    if (i != null && col === 'locales' && Array.isArray(data[col][i]?.notas)) rec.notas = data[col][i].notas;
    if (i != null) data[col][i] = rec; else { data[col].push(rec); index[col].set(key, data[col].length - 1); }
    touched[col] = (touched[col] || 0) + 1;
  }
  for (const col of Object.keys(touched)) data[col] = data[col].filter(Boolean);
  if (Object.keys(touched).length) { persist(); listeners.forEach((fn) => fn('*')); }
  return touched;
}
/** Recalcula marcas derivadas sin avisar a la vista (las llama sync.js tras fusionar). */
export function _mutate(col, fn) { (data[col] || []).forEach(fn); persist(); }
export function _replaceCollection(col, list) { data[col] = list; emit(col); }
export const _raw = (col) => data[col] || [];

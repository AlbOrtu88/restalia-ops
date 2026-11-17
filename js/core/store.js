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
  backendUrl: '', aiProvider: 'none', aiModel: '', showDemo: true, seedVersion: 0,
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
  settings = { ...DEFAULT_SETTINGS, ...(safe.get(SET_KEY) || {}) };
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
  const list = data[col] || [];
  return settings.showDemo ? list : list.filter((r) => !r.demo);
};
export const find = (col, id) => (data[col] || []).find((r) => r.id === id);
export const localName = (id) => find('locales', id)?.nombre ?? '—';
export const projectName = (id) => find('proyectos', id)?.nombre ?? '—';

// ---------- Escrituras (siempre locales; la sincronización externa pasa por Aprobaciones) ----------
export function add(col, rec, { prefix } = {}) {
  const r = { id: rec.id || uid(prefix || col.slice(0, 3)), ...rec, demo: false, source: { system: 'local', ref: null }, createdAt: new Date().toISOString() };
  data[col].unshift(r);
  emit(col);
  return r;
}
export function update(col, id, patch) {
  const i = data[col].findIndex((r) => r.id === id);
  if (i < 0) return null;
  data[col][i] = { ...data[col][i], ...patch, updatedAt: new Date().toISOString() };
  emit(col);
  return data[col][i];
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
  data = o.data; settings = { ...DEFAULT_SETTINGS, ...o.settings }; assistant = o.assistant || assistant;
  persist(); persistAI(); listeners.forEach((fn) => fn('*'));
}
export function resetDemo() { data = seedDemo(); persist(); listeners.forEach((fn) => fn('*')); }
export function removeDemo() { for (const c of COLLECTIONS) data[c] = (data[c] || []).filter((r) => !r.demo); persist(); listeners.forEach((fn) => fn('*')); }
export function wipe() { data = Object.fromEntries(COLLECTIONS.map((c) => [c, []])); data.plantillas = seedDemo().plantillas; assistant = { conversations: [], memory: [] }; persist(); persistAI(); listeners.forEach((fn) => fn('*')); }

/** Fusión sin duplicados: integra registros externos por (sistema, ref). Ver js/core/sync.js */
export function _replaceCollection(col, list) { data[col] = list; emit(col); }
export const _raw = (col) => data[col] || [];

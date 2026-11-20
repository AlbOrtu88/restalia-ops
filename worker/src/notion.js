// Notion (capa A). API con data sources (Notion-Version 2025-09-03): GET /v1/data_sources/{id} y POST /v1/data_sources/{id}/query.
// Los IDs de las fuentes NO están en el código: llegan en el secreto NOTION_DATA_SOURCES (JSON colección → id).
// El mapeo se valida contra el esquema real en cada lectura de esquema (GET /api/notion/schema) y nunca inventa propiedades:
// si una propiedad prevista no existe, el campo queda vacío y el informe de mapeo lo señala.
import { HttpError, fetchRetry, now, norm } from './util.js';

export const NOTION_COLLECTIONS = {
  locales: { name: 'Locales', app: 'locales' },
  visitas: { name: 'Visitas', app: 'visitas' },
  incidencias: { name: 'Incidencias', app: 'incidencias' },
  tareas: { name: 'Acciones y seguimientos', app: 'tareas' },
  contactos: { name: 'Contactos', app: 'contactos' },
  aprobaciones: { name: 'Bandeja de aprobaciones', app: 'aprobaciones' },
  historial: { name: 'Historial de cambios', app: 'actividad' },
  registroIA: { name: 'Registro del asistente IA', app: 'registroIA' },
  agenda: { name: 'Agenda Restalia', app: 'eventos' },
};

// Campo de la app ← nombres de propiedad de Notion (en orden de preferencia). '$title' = la propiedad de tipo título.
// Los nombres proceden de los esquemas conocidos (documento de traspaso); los marcados «opcional» se usan solo si existen.
export const MAP = {
  // «Responsable asignado» (quién lleva el local en Restalia) es distinto de «Gerente» (quien dirige el local): nunca se mezclan.
  locales: { nombre: ['$title'], direccion: ['Dirección'], estado: ['Estado'], ultimaVisita: ['Fecha última visita'], formato: ['Formato'],
    marca: ['Marca'], municipio: ['Municipio', 'Ciudad', 'Localidad'], zona: ['Zona'], responsableAsignado: ['Responsable asignado', 'Responsable'],
    gerente: ['Gerente'], franquiciado: ['Franquiciado / titular'], prioridad: ['Prioridad'], proximaVisita: ['Próxima visita'],
    notasGenerales: ['Notas generales'], codigo: ['Código', 'Codigo'] },
  // «Local»: relación con Locales (recomendado). Si aún es texto, o la columna antigua se renombró a «Local (texto)», se lee el nombre.
  visitas: { titulo: ['$title'], estado: ['Estado'], fecha: ['Fecha'], localRel: ['Local'], localNombre: ['Local (texto)', 'Local'], marca: ['Marca'], observaciones: ['Observaciones'],
    personas: ['Personas presentes'], resultado: ['Resultado general'], motivo: ['Motivo', 'Tipo'] },
  incidencias: { titulo: ['$title'], categoria: ['Categoría'], accion: ['Acción correctiva'], estado: ['Estado'], prioridad: ['Prioridad', 'Gravedad'],
    localRel: ['Local'], localNombre: ['Local (texto)', 'Local'], fecha: ['Fecha', 'Fecha detección', 'Fecha apertura'], limite: ['Fecha límite', 'Fecha compromiso'], descripcion: ['Descripción'], responsable: ['Responsable'],
    severidad: ['Severidad', 'Gravedad'], fechaObjetivo: ['Fecha objetivo'], causaRaiz: ['Causa raíz', 'Causa raiz'], siguientePaso: ['Siguiente paso'] },
  tareas: { titulo: ['Acción', '$title'], estado: ['Estado'], evidencia: ['Evidencia de cierre'], limite: ['Fecha compromiso'], localRel: ['Local'], localNombre: ['Local (texto)', 'Local'],
    descripcion: ['Notas'], origen: ['Origen'], responsable: ['Responsable'], prioridad: ['Prioridad'], siguientePaso: ['Siguiente paso'] },
  contactos: { nombre: ['Contacto', '$title'], email: ['Email'], localNombre: ['Local'], notas: ['Notas'], relacion: ['Relación'], rol: ['Rol'], telefono: ['Teléfono'] },
  aprobaciones: { accion: ['Solicitud', '$title'], estadoNotion: ['Estado'], creada: ['Fecha solicitud'], resuelta: ['Fecha resolución'], motivo: ['Motivo'],
    registro: ['Registro afectado'], tipo: ['Tipo de cambio'] },
  historial: { texto: ['Cambio', '$title'], fecha: ['Fecha'], origen: ['Origen'], campo: ['Campo modificado'], registro: ['Registro afectado'],
    aprobacion: ['Aprobación vinculada'], resultado: ['Resultado'] },
  registroIA: { titulo: ['$title'], fecha: ['Fecha'], canal: ['Canal'], intencion: ['Intención'] },
  agenda: { titulo: ['$title'], fecha: ['Fecha', '$date'], tipo: ['Tipo'], estado: ['Estado'], localNombre: ['Local'], ubicacion: ['Ubicación', 'Lugar'],
    outlookId: ['Outlook ID', 'ID Outlook', 'Evento Outlook'], notas: ['Notas'] },
};

// Propiedades que la app puede proponer cambiar (siempre vía Aprobaciones). Solo estas; el resto es de solo lectura.
export const WRITABLE = {
  locales: ['estado', 'proximaVisita', 'notasGenerales'],
  tareas: ['estado', 'limite', 'descripcion', 'evidencia'],
  incidencias: ['estado', 'accion', 'causaRaiz', 'siguientePaso', 'fechaObjetivo', 'severidad'],
  visitas: ['estado', 'observaciones', 'resultado'],
};

// Campos que la app puede rellenar al CREAR un registro (vía Aprobaciones). Los que no existan en Notion o no encajen se omiten y se informa.
export const CREATABLE = {
  tareas: ['titulo', 'estado', 'limite', 'localRel', 'localNombre', 'descripcion', 'prioridad', 'origen', 'siguientePaso'],
  visitas: ['titulo', 'fecha', 'localRel', 'localNombre', 'observaciones', 'resultado', 'motivo', 'personas', 'estado'],
  incidencias: ['titulo', 'categoria', 'accion', 'estado', 'prioridad', 'localRel', 'localNombre', 'fecha', 'limite', 'descripcion', 'severidad', 'fechaObjetivo', 'causaRaiz', 'siguientePaso'],
  historial: ['texto', 'fecha', 'registro', 'campo', 'aprobacion'],
};

export function dataSources(env) {
  try { return JSON.parse(env.NOTION_DATA_SOURCES || '{}'); } catch { return {}; }
}
export const notionConfigured = (env) => !!env.NOTION_TOKEN && Object.keys(dataSources(env)).length > 0;

async function api(env, budget, method, path, body) {
  if (!env.NOTION_TOKEN) throw new HttpError(503, 'Falta NOTION_TOKEN en el backend', 'notion-config');
  const r = await fetchRetry(`${env.NOTION_API_BASE || 'https://api.notion.com/v1'}${path}`, {
    method, headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': env.NOTION_VERSION || '2025-09-03', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }, budget);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const hint = r.status === 404 ? ' (¿está la base compartida con la integración?)' : '';
    throw new HttpError(r.status === 401 ? 503 : 502, `Notion ${r.status}: ${data.code || 'error'}${hint}`, 'notion');
  }
  return data;
}

/** Valor simple de una propiedad de Notion. */
export function propValue(p) {
  if (!p) return null;
  const v = p[p.type];
  switch (p.type) {
    case 'title': case 'rich_text': return v.map((t) => t.plain_text).join('').trim() || null;
    case 'select': case 'status': return v?.name ?? null;
    case 'multi_select': return v.map((o) => o.name);
    case 'date': return v ? { start: v.start, end: v.end } : null;
    case 'people': return v.map((u) => u.name || u.id);
    case 'relation': return v.map((x) => x.id);
    case 'files': return v.map((f) => f.name);
    case 'formula': return v ? (v.type === 'date' ? v.date?.start ?? null : v[v.type] ?? null) : null;
    case 'rollup': return v?.type === 'array' ? v.array.map(propValue) : v?.[v?.type] ?? null;
    case 'unique_id': return v ? `${v.prefix ? v.prefix + '-' : ''}${v.number}` : null;
    case 'created_by': case 'last_edited_by': return v?.name || v?.id || null;
    case 'verification': return v?.state ?? null;
    default: return v ?? null;
  }
}

function pick(props, names) {
  for (const n of names) {
    if (n === '$title') { const t = Object.values(props).find((p) => p.type === 'title'); if (t) return { name: Object.keys(props).find((k) => props[k] === t), p: t }; continue; }
    if (n === '$date') { const k = Object.keys(props).find((k) => props[k].type === 'date'); if (k) return { name: k, p: props[k] }; continue; }
    if (props[n]) return { name: n, p: props[n] };
  }
  return null;
}

const dateStart = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v.start : v) || null;
const toIso = (d) => (!d ? null : d.length === 10 ? `${d}T00:00:00` : d);

/** Convierte una página de Notion al modelo de la app. */
export function normalize(col, page) {
  const props = page.properties || {};
  const m = {};
  for (const [field, names] of Object.entries(MAP[col] || {})) { const hit = pick(props, names); m[field] = hit ? propValue(hit.p) : null; }
  const raw = Object.fromEntries(Object.entries(props).map(([k, p]) => [k, propValue(p)]));
  const rel = (v) => (Array.isArray(v) && v.length && /^[0-9a-f-]{32,36}$/.test(v[0]) ? v[0] : null);
  const txt = (v) => (Array.isArray(v) ? v.join(', ') : v);
  const base = { id: page.id, url: page.url, origen: `Notion · ${NOTION_COLLECTIONS[col].name}`, props: raw, archived: !!(page.archived || page.in_trash) };
  switch (col) {
    case 'locales': {
      const municipio = txt(m.municipio) || null;
      const responsableAsignado = txt(m.responsableAsignado) || null;
      // `ciudad` y `responsable` se mantienen por compatibilidad con el resto de módulos de la app.
      return { ...base, nombre: m.nombre || '(sin nombre)', direccion: m.direccion, estado: m.estado, formato: m.formato, marca: txt(m.marca),
        municipio, ciudad: municipio, zona: txt(m.zona) || null, responsableAsignado, responsable: responsableAsignado, gerente: txt(m.gerente) || null,
        franquiciado: txt(m.franquiciado) || null, prioridad: m.prioridad, proximaVisita: toIso(dateStart(m.proximaVisita)), notasGenerales: m.notasGenerales,
        codigo: m.codigo, ultimaVisita: toIso(dateStart(m.ultimaVisita)), notionEditedAt: page.last_edited_time || null };
    }
    case 'visitas': return { ...base, titulo: m.titulo, estado: m.estado, fecha: toIso(dateStart(m.fecha)), localNombre: rel(m.localNombre) ? null : txt(m.localNombre),
      localId: rel(m.localRel) || rel(m.localNombre), marca: txt(m.marca), observaciones: m.observaciones, personas: txt(m.personas), resultado: m.resultado,
      motivo: txt(m.motivo) || m.titulo, responsable: 'Alberto', fotos: [], incidencias: [], acciones: [] };
    case 'incidencias': return { ...base, titulo: m.titulo, categoria: m.categoria, accion: m.accion, estado: m.estado || 'Sin estado en Notion', prioridad: m.prioridad,
      localNombre: rel(m.localNombre) ? null : txt(m.localNombre), localId: rel(m.localRel) || rel(m.localNombre), fecha: toIso(dateStart(m.fecha)) || page.created_time,
      limite: toIso(dateStart(m.limite)), descripcion: m.descripcion, responsable: txt(m.responsable), severidad: txt(m.severidad) || null,
      fechaObjetivo: toIso(dateStart(m.fechaObjetivo)), causaRaiz: m.causaRaiz || null, siguientePaso: m.siguientePaso || null, notionEditedAt: page.last_edited_time || null, seguimiento: [] };
    case 'tareas': return { ...base, titulo: m.titulo, estado: m.estado, evidencia: m.evidencia, limite: toIso(dateStart(m.limite)), localNombre: rel(m.localNombre) ? null : txt(m.localNombre),
      localId: rel(m.localRel) || rel(m.localNombre), siguientePaso: m.siguientePaso || null, descripcion: m.descripcion, origenNotion: m.origen, responsable: txt(m.responsable) || 'Alberto', prioridad: m.prioridad || 'Media',
      creada: page.created_time, proyectoId: null, evidencias: [] };
    case 'contactos': return { ...base, nombre: m.nombre, email: m.email, telefono: m.telefono, localNombre: txt(m.localNombre), notas: m.notas, relacion: m.relacion, rol: m.rol };
    case 'aprobaciones': return { ...base, accion: m.accion, sistema: 'Notion', soloLectura: true, motivo: m.motivo,
      datos: { 'Registro afectado': m.registro, 'Tipo de cambio': txt(m.tipo) }, estado: m.estadoNotion === 'Pendiente' ? 'Pendiente (Notion)' : m.estadoNotion,
      creada: toIso(dateStart(m.creada)) || page.created_time, resuelta: toIso(dateStart(m.resuelta)), origen: 'Bandeja de aprobaciones (Notion)', historial: [] };
    case 'historial': return { ...base, texto: m.texto, fecha: toIso(dateStart(m.fecha)) || page.created_time, modulo: 'notion', origenNotion: m.origen, campo: m.campo,
      registro: m.registro, aprobacion: m.aprobacion, resultado: m.resultado };
    case 'registroIA': return { ...base, titulo: m.titulo, fecha: toIso(dateStart(m.fecha)), canal: m.canal, intencion: m.intencion };
    case 'agenda': {
      const d = m.fecha && typeof m.fecha === 'object' ? m.fecha : { start: dateStart(m.fecha) };
      const allDay = !!d.start && d.start.length === 10;
      const tipos = { visita: 'visita', reunion: 'reunion', reunión: 'reunion', auditoria: 'auditoria', auditoría: 'auditoria', seguimiento: 'seguimiento', tarea: 'tarea', limite: 'limite', límite: 'limite' };
      return { ...base, titulo: m.titulo, tipo: tipos[norm(txt(m.tipo))] || tipos[String(txt(m.tipo) || '').toLowerCase()] || 'reunion', tipoNotion: txt(m.tipo),
        inicio: toIso(d.start), fin: toIso(d.end || d.start), allDay, estado: m.estado || 'Confirmado', localNombre: rel(m.localNombre) ? null : txt(m.localNombre),
        localId: rel(m.localNombre), ubicacion: txt(m.ubicacion), outlookId: m.outlookId, notas: m.notas, responsable: 'Alberto' };
    }
    default: return { ...base };
  }
}

/**
 * Comprobación en vivo (con sesión): consulta Locales directamente en Notion y lo compara con la copia del backend.
 * Sirve para saber que la cadena Notion → Worker → app funciona de verdad, no solo que el Worker responde.
 */
export async function liveCheck(env, budget) {
  const out = { at: now(), configured: notionConfigured(env), collections: Object.keys(dataSources(env)) };
  if (!out.configured) return { ...out, ok: false, error: 'Falta NOTION_TOKEN o NOTION_DATA_SOURCES en el backend' };
  const t0 = Date.now();
  try {
    const res = await query(env, budget, 'locales', { maxPages: 3 });
    const live = res.pages.filter((p) => !p.archived && !p.in_trash);
    const sample = live[0] ? normalize('locales', live[0]) : null;
    const row = await env.DB.prepare("SELECT COUNT(*) n, MAX(synced_at) last FROM records WHERE system = 'notion' AND collection = 'locales' AND deleted = 0").first();
    return { ...out, ok: true, ms: Date.now() - t0,
      notion: { locales: live.length, complete: res.done, conResponsableAsignado: live.filter((p) => propValue(p.properties?.['Responsable asignado'])).length },
      backend: { locales: row?.n ?? 0, lastSync: row?.last ?? null }, inSync: res.done ? live.length === (row?.n ?? 0) : null,
      sample: sample && { nombre: sample.nombre, marca: sample.marca, municipio: sample.municipio, zona: sample.zona, responsableAsignado: sample.responsableAsignado, gerente: sample.gerente } };
  } catch (e) {
    return { ...out, ok: false, ms: Date.now() - t0, error: e instanceof HttpError ? e.message : 'Error inesperado al consultar Notion' };
  }
}

/** Esquema real de una fuente + informe de mapeo (qué campos previstos existen y cuáles no). */
export async function schema(env, budget, col) {
  const id = dataSources(env)[col];
  if (!id) throw new HttpError(404, `Sin ID de Notion para «${col}»`);
  const ds = await api(env, budget, 'GET', `/data_sources/${id}`);
  const props = Object.fromEntries(Object.entries(ds.properties || {}).map(([k, p]) => [k, {
    type: p.type, options: (p[p.type]?.options || []).map((o) => o.name), groups: (p.status?.groups || []).map((g) => g.name),
    relation: p.type === 'relation' ? p.relation?.data_source_id || p.relation?.database_id : undefined,
  }]));
  const mapping = Object.fromEntries(Object.entries(MAP[col] || {}).map(([field, names]) => {
    const hit = pick(ds.properties || {}, names);
    return [field, hit ? { property: hit.name, type: hit.p.type } : null];
  }));
  const used = new Set(Object.values(mapping).filter(Boolean).map((x) => x.property));
  const out = { collection: col, name: NOTION_COLLECTIONS[col].name, title: (ds.title || []).map((t) => t.plain_text).join(''), properties: props,
    mapping, missing: Object.keys(mapping).filter((k) => !mapping[k]), unmapped: Object.keys(props).filter((k) => !used.has(k)), fetchedAt: now() };
  await env.DB.prepare('INSERT INTO schema_cache (collection, data, fetched_at) VALUES (?, ?, ?) ON CONFLICT(collection) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at')
    .bind(col, JSON.stringify(out), out.fetchedAt).run();
  return out;
}

/**
 * Consulta paginada. full=false → solo páginas editadas desde `since` (last_edited_time, con 2 min de margen).
 * Devuelve { pages, next, done }. Si el presupuesto se agota, done=false y next permite seguir en la siguiente ejecución.
 */
export async function query(env, budget, col, { since, startCursor, maxPages = 5 } = {}) {
  const id = dataSources(env)[col];
  if (!id) throw new HttpError(404, `Sin ID de Notion para «${col}»`);
  const pages = [];
  let cursor = startCursor || undefined;
  for (let i = 0; i < maxPages; i++) {
    if (budget.left < 2) return { pages, next: cursor, done: false };
    const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    if (since) body.filter = { timestamp: 'last_edited_time', last_edited_time: { on_or_after: new Date(Date.parse(since) - 120000).toISOString() } };
    const r = await api(env, budget, 'POST', `/data_sources/${id}/query`, body);
    pages.push(...r.results.filter((x) => x.object === 'page'));
    if (!r.has_more) return { pages, next: null, done: true };
    cursor = r.next_cursor;
  }
  return { pages, next: cursor, done: false };
}

/** Escritura en Notion: solo la llama approvals.js tras aprobación explícita. Valida contra el esquema real. */
export async function updatePage(env, budget, col, pageId, changes, { expectedEditedAt } = {}) {
  // Control de conflictos: si la página cambió en Notion después de que la app la leyera, no se pisa.
  if (expectedEditedAt) {
    const cur = await api(env, budget, 'GET', `/pages/${pageId}`);
    if (cur.last_edited_time && Date.parse(cur.last_edited_time) > Date.parse(expectedEditedAt)) {
      throw new HttpError(409, `La página cambió en Notion (${cur.last_edited_time}) después de tu propuesta. Sincroniza y vuelve a proponer el cambio.`, 'conflict');
    }
  }
  const sch = await schema(env, budget, col);
  const properties = {};
  for (const [field, value] of Object.entries(changes)) {
    if (!(WRITABLE[col] || []).includes(field)) throw new HttpError(422, `El campo «${field}» no se puede modificar desde la app`);
    const m = sch.mapping[field];
    if (!m) throw new HttpError(422, `La base «${sch.name}» no tiene propiedad para «${field}»`);
    const def = sch.properties[m.property];
    if (value == null || value === '') { // vaciar el campo (solo tipos que lo admiten)
      const empty = { rich_text: { rich_text: [] }, date: { date: null }, select: { select: null } }[def.type];
      if (!empty) throw new HttpError(422, `«${m.property}» no se puede dejar vacío`);
      properties[m.property] = empty; continue;
    }
    if (['status', 'select'].includes(def.type) && !def.options.includes(value)) throw new HttpError(422, `«${value}» no es una opción válida de ${m.property} (${def.options.join(', ')})`);
    properties[m.property] = toNotionValue(def.type, value);
  }
  return api(env, budget, 'PATCH', `/pages/${pageId}`, { properties });
}

/**
 * Crea una página. Solo campos de CREATABLE. Un campo sin propiedad en Notion, de tipo que no encaja (p. ej. «Local» como texto
 * cuando llega el id del local) o con una opción que no existe se OMITE (no se inventa nada) y se devuelve en `skipped`.
 */
export async function createPage(env, budget, col, fields) {
  const sch = await schema(env, budget, col);
  const properties = {};
  const skipped = [];
  for (const [field, value] of Object.entries(fields)) {
    if (value == null || value === '') continue;
    if (!(CREATABLE[col] || []).includes(field)) throw new HttpError(422, `El campo «${field}» no se puede rellenar al crear en ${sch.name}`);
    const m = sch.mapping[field];
    if (!m) { skipped.push(field); continue; }
    const def = sch.properties[m.property];
    if (properties[m.property]) continue; // la misma columna ya la rellenó otro campo (p. ej. «Local» como relación)
    if (field === 'localRel' && def.type !== 'relation') { skipped.push(field); continue; }
    if (field === 'localNombre' && !['rich_text', 'select', 'title'].includes(def.type)) { skipped.push(field); continue; }
    if (['status', 'select'].includes(def.type) && !def.options.includes(value)) { skipped.push(`${field} («${value}» no es opción de ${m.property})`); continue; }
    try { properties[m.property] = toNotionValue(def.type, value, { datetime: field === 'fecha' }); }
    catch { skipped.push(field); }
  }
  if (!Object.values(sch.mapping).some((x) => x && x.type === 'title' && properties[x.property])) throw new HttpError(422, 'Falta el título');
  const page = await api(env, budget, 'POST', '/pages', { parent: { type: 'data_source_id', data_source_id: dataSources(env)[col] }, properties });
  return { ...page, skipped };
}

function toNotionValue(type, v, { datetime = false } = {}) {
  switch (type) {
    case 'relation': {
      const ids = (Array.isArray(v) ? v : [v]).filter((x) => /^[0-9a-f-]{32,36}$/i.test(String(x)));
      if (!ids.length) throw new HttpError(422, 'Relación no válida');
      return { relation: ids.map((id) => ({ id })) };
    }
    case 'title': return { title: [{ text: { content: String(v).slice(0, 1900) } }] };
    case 'rich_text': return { rich_text: [{ text: { content: String(v).slice(0, 1900) } }] };
    case 'status': return { status: { name: v } };
    case 'select': return { select: { name: v } };
    case 'date': return { date: { start: datetime && String(v).includes('T') ? new Date(v).toISOString() : String(v).slice(0, 10) } };
    case 'email': return { email: v };
    case 'phone_number': return { phone_number: v };
    case 'number': return { number: Number(v) };
    case 'checkbox': return { checkbox: !!v };
    default: throw new HttpError(422, `Tipo de propiedad «${type}» no admitido para escritura`);
  }
}

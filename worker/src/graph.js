// Microsoft Graph (capa B) · SOLO LECTURA.
// El cliente rechaza cualquier método distinto de GET, salvo POST /search/query (búsqueda, también de lectura).
// SharePoint y OneDrive nunca se modifican. No hay envío de correo (Mail.Send no se solicita).
import { HttpError, fetchRetry, htmlToText, norm, shortHash } from './util.js';
import { graphToken } from './auth.js';

// GRAPH_BASE solo se cambia en pruebas locales (servidor simulado).
const graphBase = (env) => env.GRAPH_BASE || 'https://graph.microsoft.com/v1.0';
const READ_POST_ALLOW = ['/search/query'];

export async function gfetch(env, budget, pathOrUrl, { method = 'GET', body, headers = {} } = {}) {
  const GRAPH = graphBase(env);
  const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : GRAPH + pathOrUrl;
  if (!url.startsWith(GRAPH + '/')) throw new HttpError(400, 'URL de Graph no válida');
  const path = url.slice(GRAPH.length).split('?')[0];
  if (method !== 'GET' && !(method === 'POST' && READ_POST_ALLOW.includes(path))) throw new HttpError(403, 'Microsoft 365 es de solo lectura en esta app');
  const tok = await graphToken(env, budget);
  if (!tok) throw new HttpError(401, 'Microsoft 365 no está conectado', 'graph-auth');
  const r = await fetchRetry(url, { method, headers: { Authorization: `Bearer ${tok.access}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }, budget);
  if (r.status === 410) return { gone: true };
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const code = data?.error?.code || r.status;
    if (r.status === 403) throw new HttpError(403, `Permiso insuficiente en Microsoft 365 (${code}). Puede requerir consentimiento de TI.`, 'graph-perm');
    if (r.status === 401) throw new HttpError(401, 'La sesión de Microsoft ha caducado', 'graph-auth');
    throw new HttpError(502, `Microsoft Graph ${r.status}: ${code}`, 'graph');
  }
  return data;
}

// ---------- Detección por reglas (se marca como inferida; nunca como hecho) ----------
const REQ = /\b(necesito|necesitamos|puedes|podr[ií]as|podemos|por favor|te pido|os pido|solicito|confirma|confirmad|revisa|revisad|env[ií]a|enviad|manda|mandad|aprueba|prepara|preparad|me dices|me confirmas|urge|urgente)\b|\?/i;
const DAYS = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0 };

/** Busca un plazo en el texto. Devuelve { texto, fecha (ISO día) } o null. */
export function detectDeadline(text, ref = new Date()) {
  const t = norm(text);
  const base = new Date(ref); base.setUTCHours(12, 0, 0, 0);
  const add = (n) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  let m;
  if ((m = t.match(/\b(antes del?|para el|hasta el|el)\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/))) {
    const diff = ((DAYS[m[2]] - base.getUTCDay()) + 7) % 7 || 7;
    return { texto: `${m[1]} ${m[2]}`, fecha: add(diff) };
  }
  if ((m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/))) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : base.getUTCFullYear();
    const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1]), 12));
    if (!Number.isNaN(d) && Number(m[2]) <= 12 && Number(m[1]) <= 31) return { texto: m[0], fecha: d.toISOString().slice(0, 10) };
  }
  if (/\b(hoy|esta manana|esta tarde|cuanto antes|asap|urgente)\b/.test(t)) return { texto: 'hoy', fecha: add(0) };
  if (/\bmanana\b/.test(t)) return { texto: 'mañana', fecha: add(1) };
  if (/\besta semana\b/.test(t)) return { texto: 'esta semana', fecha: add((5 - base.getUTCDay() + 7) % 7) };
  if (/\b(la semana que viene|la proxima semana)\b/.test(t)) return { texto: 'la próxima semana', fecha: add(((5 - base.getUTCDay() + 7) % 7) + 7) };
  return null;
}

export function analyze({ subject = '', text = '', importance, flagged, mention, received }) {
  const full = `${subject}. ${text}`;
  const solicitud = REQ.test(full);
  const plazo = detectDeadline(full, received ? new Date(received) : new Date());
  const days = plazo ? (Date.parse(plazo.fecha) - Date.now()) / 864e5 : null;
  const prioridad = importance === 'high' || flagged || mention || (solicitud && days != null && days <= 2) ? 'Alta' : solicitud || plazo ? 'Media' : 'Baja';
  const compromisos = solicitud && plazo ? [`${subject || text.slice(0, 60)} · plazo: ${plazo.texto}`] : [];
  return { solicitud, plazo, prioridad, compromisos, deteccion: 'reglas', inferido: true };
}

const at = (dt) => (dt ? (dt.endsWith('Z') ? dt : `${dt}Z`) : null);

// ---------- Normalizadores ----------
export async function mailToRecord(m) {
  const a = analyze({ subject: m.subject, text: m.bodyPreview, importance: m.importance, flagged: m.flag?.flagStatus === 'flagged', received: m.receivedDateTime });
  return {
    id: `ms-${await shortHash('mail:' + m.id)}`, canal: 'outlook', de: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '—',
    deEmail: m.from?.emailAddress?.address || null, asunto: m.subject || '(sin asunto)', extracto: (m.bodyPreview || '').slice(0, 280), fecha: m.receivedDateTime,
    importante: a.prioridad === 'Alta', pendiente: a.solicitud && m.flag?.flagStatus !== 'complete', prioridad: a.prioridad, plazo: a.plazo, compromisos: a.compromisos,
    tareasDetectadas: a.solicitud ? [m.subject || 'Responder correo'] : [], deteccion: 'reglas', inferido: true, leido: !!m.isRead,
    adjuntos: !!m.hasAttachments, url: m.webLink, equipo: '', canalTeams: '', localId: null,
  };
}

export async function eventToRecord(e) {
  const online = !!e.isOnlineMeeting || !!e.onlineMeeting;
  return {
    id: `ms-${await shortHash('cal:' + e.id)}`, titulo: e.subject || '(sin título)', tipo: 'reunion', inicio: at(e.start?.dateTime), fin: at(e.end?.dateTime),
    allDay: !!e.isAllDay, ubicacion: e.location?.displayName || (online ? 'Teams' : ''), responsable: e.organizer?.emailAddress?.name || '',
    estado: e.isCancelled ? 'Cancelado' : ({ tentative: 'Provisional', busy: 'Confirmado', free: 'Libre', oof: 'Fuera de la oficina' }[e.showAs] || 'Confirmado'),
    cancelado: !!e.isCancelled, asistentes: (e.attendees || []).length, online, url: e.webLink, origen: 'Outlook Calendar', localId: null,
    esReunion: (e.attendees || []).length > 0 || online,
  };
}

const AREAS = [
  ['Operaciones', /apertur|cierre|procedim|operaci|manual|checklist|protocolo/],
  ['Calidad y seguridad alimentaria', /calidad|auditor|appcc|alergen|sanidad|higien|temperatur/],
  ['Personas y formación', /rrhh|personal|turno|formaci|cuadrante|contrat|nomina|plantilla/],
  ['Mantenimiento y obras', /manten|obra|reforma|tecnic|averia|instalaci/],
  ['Marketing y marca', /marketing|promoci|cartel|marca|campan|carta|menu/],
  ['Finanzas', /factur|presupuest|finanz|cuenta|p&l|ventas|ebitda|coste/],
  ['Expansión y aperturas', /expansi|franquic|nuevo local|aperturas/],
];
const TYPES = { pdf: 'PDF', doc: 'Word', docx: 'Word', xls: 'Excel', xlsx: 'Excel', xlsm: 'Excel', csv: 'Excel', ppt: 'PowerPoint', pptx: 'PowerPoint', jpg: 'Imagen', jpeg: 'Imagen', png: 'Imagen', heic: 'Imagen', txt: 'Texto', md: 'Texto', msg: 'Correo', eml: 'Correo' };

export async function driveItemToRecord(it, origin = 'OneDrive') {
  const path = decodeURIComponent((it.parentReference?.path || '').replace(/^.*?root:/, '')) || '/';
  const hay = norm(`${path} ${it.name}`);
  const area = (AREAS.find(([, re]) => re.test(hay)) || ['General'])[0];
  const ext = (it.name.split('.').pop() || '').toLowerCase();
  return {
    id: `ms-${await shortHash('file:' + (it.parentReference?.driveId || '') + it.id)}`, titulo: it.name, area, areaInferida: true, tipo: TYPES[ext] || (ext ? ext.toUpperCase() : 'Archivo'),
    origen: origin, ubicacion: path, fecha: it.lastModifiedDateTime, modificadoPor: it.lastModifiedBy?.user?.displayName || null, tamano: it.size || 0,
    resumen: it.searchSnippet ? htmlToText(it.searchSnippet, 300) : null, url: it.webUrl,
  };
}

export async function teamsMessageToRecord(msg, { team, channel, meId }) {
  const text = htmlToText(msg.body?.content || '', 400);
  const mention = (msg.mentions || []).some((m) => m.mentioned?.user?.id === meId);
  const a = analyze({ subject: msg.subject || '', text, importance: msg.importance === 'urgent' || msg.importance === 'high' ? 'high' : 'normal', mention, received: msg.createdDateTime });
  return {
    id: `ms-${await shortHash('teams:' + msg.id + (channel || ''))}`, canal: 'teams', de: msg.from?.user?.displayName || msg.from?.application?.displayName || '—',
    asunto: msg.subject || text.slice(0, 70) || '(mensaje)', extracto: text.slice(0, 280), fecha: msg.createdDateTime, mencion: mention,
    importante: a.prioridad === 'Alta', pendiente: a.solicitud, prioridad: a.prioridad, plazo: a.plazo, compromisos: a.compromisos,
    tareasDetectadas: a.solicitud ? [msg.subject || text.slice(0, 60)] : [], deteccion: 'reglas', inferido: true, equipo: team, canalTeams: channel, url: msg.webUrl, localId: null,
  };
}

/** Búsqueda en vivo (no se almacena): correo por remitente/asunto/contenido o archivos de OneDrive y SharePoint. */
export async function searchMail(env, budget, q, { from, since } = {}) {
  const parts = [];
  if (q) parts.push(q.replace(/"/g, ''));
  if (from) parts.push(`from:${from.replace(/"/g, '')}`);
  if (since) parts.push(`received>=${since.slice(0, 10)}`);
  const sel = '$select=id,subject,from,receivedDateTime,bodyPreview,importance,webLink,flag,hasAttachments,isRead&$top=25';
  const r = await gfetch(env, budget, `/me/messages?$search=${encodeURIComponent(`"${parts.join(' ')}"`)}&${sel}`);
  return Promise.all((r.value || []).map(mailToRecord));
}

export async function searchFiles(env, budget, q) {
  const r = await gfetch(env, budget, '/search/query', { method: 'POST', body: { requests: [{ entityTypes: ['driveItem'], query: { queryString: q }, from: 0, size: 25 }] } });
  const hits = r.value?.[0]?.hitsContainers?.[0]?.hits || [];
  return Promise.all(hits.map((h) => driveItemToRecord({ ...h.resource, searchSnippet: h.summary }, /sharepoint\.com\/sites\//.test(h.resource?.webUrl || '') ? 'SharePoint' : 'OneDrive')));
}

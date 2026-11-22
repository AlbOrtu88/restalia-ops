// Servidor simulado de Notion, Microsoft Entra ID, Microsoft Graph y Factorial (MCP) para pruebas locales (datos ficticios).
// node test/mock-apis.mjs  → http://localhost:8790
import http from 'node:http';

const PORT = 8790, B = `http://localhost:${PORT}`;
const log = [];
const T0 = Date.now();
const iso = (d) => new Date(T0 + d * 864e5).toISOString();
const rt = (s) => [{ plain_text: s }];
const page = (id, props, extra = {}) => ({ object: 'page', id, url: `https://www.notion.so/${id.replace(/-/g, '')}`, created_time: iso(-10), last_edited_time: iso(-1), archived: false, properties: props, ...extra });

const SCHEMAS = {
  // Copia del esquema real de «Locales» (20-nov-2026), con datos ficticios.
  'ds-locales': { 'Local': { type: 'title', title: {} }, 'Dirección': { type: 'rich_text' }, 'Estado': { type: 'select', select: { options: [{ name: 'Pendiente de asignación' }, { name: 'Activo' }, { name: 'En seguimiento' }, { name: 'Inactivo' }] } }, 'Fecha última visita': { type: 'date' }, 'Formato': { type: 'select', select: { options: [{ name: 'Calle' }, { name: 'Centro comercial' }, { name: 'Otro' }] } },
    'Marca': { type: 'select', select: { options: [{ name: 'Marca Ficticia' }] } }, 'Municipio': { type: 'rich_text' }, 'Zona': { type: 'rich_text' }, 'Gerente': { type: 'rich_text' }, 'Responsable asignado': { type: 'rich_text' },
    'Franquiciado / titular': { type: 'rich_text' }, 'Prioridad': { type: 'select', select: { options: [{ name: 'Alta' }, { name: 'Media' }, { name: 'Baja' }] } }, 'Próxima visita': { type: 'date' }, 'Notas generales': { type: 'rich_text' } },
  'ds-tareas': { 'Acción': { type: 'title', title: {} }, 'Estado': { type: 'status', status: { options: [{ name: 'Pendiente' }, { name: 'En curso' }, { name: 'Bloqueada' }, { name: 'Hecha' }, { name: 'Cancelada' }], groups: [] } }, 'Fecha compromiso': { type: 'date' }, 'Local': { type: 'rich_text' }, 'Notas': { type: 'rich_text' }, 'Origen': { type: 'select', select: { options: [{ name: 'Visita' }] } }, 'Evidencia de cierre': { type: 'rich_text' } },
  // Visitas e Incidencias con «Local» ya convertido en relación y la columna antigua renombrada a «Local (texto)».
  'ds-visitas': { 'Visita': { type: 'title', title: {} }, 'Fecha': { type: 'date' }, 'Local': { type: 'relation', relation: { data_source_id: 'ds-locales' } }, 'Local (texto)': { type: 'rich_text' },
    'Observaciones': { type: 'rich_text' }, 'Resultado general': { type: 'select', select: { options: [{ name: 'Correcta' }, { name: 'Con incidencias' }, { name: 'Crítica' }] } }, 'Motivo': { type: 'select', select: { options: [{ name: 'Visita rutinaria' }] } } },
  'ds-incidencias': { 'Incidencia': { type: 'title', title: {} }, 'Estado': { type: 'status', status: { options: [{ name: 'Nueva' }, { name: 'En curso' }, { name: 'Resuelta' }], groups: [] } }, 'Local': { type: 'relation', relation: { data_source_id: 'ds-locales' } },
    'Categoría': { type: 'select', select: { options: [{ name: 'Mantenimiento' }] } }, 'Prioridad': { type: 'select', select: { options: [{ name: 'Alta' }, { name: 'Media' }] } }, 'Severidad': { type: 'select', select: { options: [{ name: 'Crítica' }, { name: 'Alta' }, { name: 'Media' }, { name: 'Baja' }] } },
    'Fecha': { type: 'date' }, 'Fecha objetivo': { type: 'date' }, 'Causa raíz': { type: 'rich_text' }, 'Siguiente paso': { type: 'rich_text' }, 'Descripción': { type: 'rich_text' }, 'Acción correctiva': { type: 'rich_text' } },
  'ds-historial': { 'Cambio': { type: 'title', title: {} }, 'Fecha': { type: 'date' }, 'Registro afectado': { type: 'rich_text' }, 'Campo modificado': { type: 'rich_text' }, 'Aprobación vinculada': { type: 'rich_text' } },
};
let tareas = [
  page('aaaaaaaa-0000-0000-0000-000000000001', { 'Acción': { type: 'title', title: rt('Revisar cámara FICTICIA') }, 'Estado': { type: 'status', status: { name: 'Pendiente' } }, 'Fecha compromiso': { type: 'date', date: { start: iso(2).slice(0, 10) } }, 'Local': { type: 'rich_text', rich_text: rt('Local Prueba 1') }, 'Notas': { type: 'rich_text', rich_text: rt('nota') }, 'Origen': { type: 'select', select: { name: 'Visita' } }, 'Evidencia de cierre': { type: 'rich_text', rich_text: [] } }),
  page('aaaaaaaa-0000-0000-0000-000000000002', { 'Acción': { type: 'title', title: rt('Tarea dos FICTICIA') }, 'Estado': { type: 'status', status: { name: 'Hecha' } }, 'Fecha compromiso': { type: 'date', date: null }, 'Local': { type: 'rich_text', rich_text: [] }, 'Notas': { type: 'rich_text', rich_text: [] }, 'Origen': { type: 'select', select: null }, 'Evidencia de cierre': { type: 'rich_text', rich_text: [] } }),
];
const locales = [page('bbbbbbbb-0000-0000-0000-000000000001', { 'Local': { type: 'title', title: rt('Local Prueba 1') }, 'Dirección': { type: 'rich_text', rich_text: rt('Calle Falsa 1, 28222 Majadahonda') }, 'Estado': { type: 'select', select: { name: 'Activo' } }, 'Fecha última visita': { type: 'date', date: { start: iso(-5).slice(0, 10) } }, 'Formato': { type: 'select', select: { name: 'Centro comercial' } },
  'Marca': { type: 'select', select: { name: 'Marca Ficticia' } }, 'Municipio': { type: 'rich_text', rich_text: rt('Majadahonda') }, 'Zona': { type: 'rich_text', rich_text: rt('Comunidad de Madrid') }, 'Gerente': { type: 'rich_text', rich_text: rt('Gerente Ficticio') },
  'Responsable asignado': { type: 'rich_text', rich_text: rt('Responsable Ficticio') }, 'Franquiciado / titular': { type: 'rich_text', rich_text: [] }, 'Prioridad': { type: 'select', select: null }, 'Próxima visita': { type: 'date', date: null }, 'Notas generales': { type: 'rich_text', rich_text: rt('Nota ficticia') } })];
const incidencias = [page('dddddddd-0000-0000-0000-000000000001', { 'Incidencia': { type: 'title', title: rt('Fuga FICTICIA') }, 'Estado': { type: 'status', status: { name: 'En curso' } }, 'Local': { type: 'relation', relation: [{ id: 'bbbbbbbb-0000-0000-0000-000000000001' }] },
  'Categoría': { type: 'select', select: { name: 'Mantenimiento' } }, 'Prioridad': { type: 'select', select: { name: 'Alta' } }, 'Severidad': { type: 'select', select: { name: 'Alta' } }, 'Fecha': { type: 'date', date: { start: iso(-2).slice(0, 10) } },
  'Fecha objetivo': { type: 'date', date: { start: iso(5).slice(0, 10) } }, 'Causa raíz': { type: 'rich_text', rich_text: rt('Junta gastada') }, 'Siguiente paso': { type: 'rich_text', rich_text: rt('Llamar al técnico') }, 'Descripción': { type: 'rich_text', rich_text: [] }, 'Acción correctiva': { type: 'rich_text', rich_text: [] } })];
const pagesOf = { 'ds-locales': () => locales, 'ds-tareas': () => tareas, 'ds-historial': () => [], 'ds-visitas': () => [], 'ds-incidencias': () => incidencias };
export const lastCreated = [];

function jwt(payload) { const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); return `${b({ alg: 'none' })}.${b(payload)}.x`; }

// Factorial: metadatos OAuth, registro dinámico de clientes, token y servidor MCP (JSON-RPC, respuestas JSON y SSE).
export const factorialCalls = [];
let fClients = 0;
const F_TOOLS = [
  { name: 'clock_in', description: 'Ficha la entrada del empleado', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_clock_status', description: 'Estado del fichaje', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: {} } },
  { name: 'list_leaves', description: 'Ausencias del empleado', inputSchema: { type: 'object', properties: {} } },
  { name: 'request_time_off', description: 'Pide vacaciones', inputSchema: { type: 'object', required: ['start_on', 'finish_on'], properties: { start_on: { type: 'string', format: 'date' }, finish_on: { type: 'string', format: 'date' } } } },
];
function factorialMcp(req, res, body) {
  const auth = req.headers.authorization || '';
  if (!/^Bearer FAT-/.test(auth)) { res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }); res.end(); return; }
  const msg = JSON.parse(body || '{}');
  if (msg.method === 'initialize') { res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'ses-1' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'factorial-mock', version: '1' } } })); return; }
  if (req.headers['mcp-session-id'] !== 'ses-1') { res.writeHead(400); res.end('sin sesión'); return; }
  if (!msg.id) { res.writeHead(202); res.end(); return; }
  let result;
  if (msg.method === 'tools/list') result = { tools: F_TOOLS };
  else if (msg.method === 'tools/call') {
    factorialCalls.push(msg.params);
    const n = msg.params.name;
    result = n === 'get_clock_status' ? { content: [{ type: 'text', text: JSON.stringify({ clocked_in: false }) }] }
      : n === 'list_leaves' ? { content: [{ type: 'text', text: JSON.stringify([{ type: 'Vacaciones', start_on: '2026-12-22', finish_on: '2026-12-26' }]) }] }
      : n === 'clock_in' ? { content: [{ type: 'text', text: 'Entrada fichada a las 09:00' }] }
      : { content: [{ type: 'text', text: 'Solicitud enviada' }] };
  }
  // tools/call responde en SSE (como hace un servidor Streamable HTTP real); el resto en JSON.
  if (msg.method === 'tools/call') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })}\n\n`); return; }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
}

const routes = [
  ['GET', /^\/factorial-mcp\/\.well-known\/oauth-authorization-server$/, () => [200, { issuer: `${B}/factorial-mcp/`, authorization_endpoint: `${B}/factorial-api/oauth/authorize`, token_endpoint: `${B}/factorial-api/oauth/token`, registration_endpoint: `${B}/factorial-mcp/oauth/register`, code_challenge_methods_supported: ['S256'] }]],
  ['POST', /^\/factorial-mcp\/oauth\/register$/, (m, body) => { const d = JSON.parse(body || '{}'); if (!d.redirect_uris?.[0]?.endsWith('/api/factorial/callback')) return [400, { error: 'invalid_redirect_uri' }]; fClients++; return [201, { client_id: 'fc-' + fClients, client_secret: 'fs-secreto', redirect_uris: d.redirect_uris }]; }],
  ['GET', /^\/factorial-api\/oauth\/authorize$/, () => [200, {}]],
  ['POST', /^\/factorial-api\/oauth\/token$/, (m, body) => {
    const p = new URLSearchParams(body);
    if (!p.get('client_id')?.startsWith('fc-') || p.get('client_secret') !== 'fs-secreto' || !p.get('resource')?.includes('/factorial-mcp/')) return [401, { error: 'invalid_client' }];
    if (p.get('grant_type') === 'authorization_code' && (!p.get('code_verifier') || !p.get('redirect_uri'))) return [400, { error: 'invalid_request' }];
    return [200, { access_token: 'FAT-' + Date.now(), refresh_token: 'FRT', expires_in: 3600, scope: 'time_tracking time_off' }];
  }],
  ['GET', /^\/login\/([^/]+)\/oauth2\/v2\.0\/authorize$/, () => [200, {}]],
  ['POST', /^\/__del$/, () => { tareas = tareas.slice(0, 1); return [200, {}]; }],
  ['POST', /^\/login\/([^/]+)\/oauth2\/v2\.0\/token$/, (m, body) => {
    const p = new URLSearchParams(body);
    if (p.get('grant_type') === 'authorization_code' && !p.get('code_verifier')) return [400, { error: 'invalid_request' }];
    return [200, { access_token: 'AT-' + Date.now(), refresh_token: 'RT', expires_in: 3600, scope: p.get('scope') || 'Mail.Read', id_token: jwt({ tid: m[1], preferred_username: p.get('code') === 'otro' ? 'otra@persona.test' : 'test@example.com', name: 'Usuario Prueba', oid: 'me-oid' }) }];
  }],
  ['GET', /^\/notion\/data_sources\/([^/]+)$/, (m) => SCHEMAS[m[1]] ? [200, { object: 'data_source', id: m[1], title: rt(m[1]), properties: SCHEMAS[m[1]] }] : [404, { code: 'object_not_found' }]],
  ['POST', /^\/notion\/data_sources\/([^/]+)\/query$/, (m, body) => {
    const q = JSON.parse(body || '{}'); const all = pagesOf[m[1]]?.() || [];
    const start = Number(q.start_cursor || 0); const size = 1; // paginación de 1 en 1 para probarla
    const slice = all.slice(start, start + size);
    return [200, { object: 'list', results: slice, has_more: start + size < all.length, next_cursor: start + size < all.length ? String(start + size) : null }];
  }],
  // Nominatim simulado: encuentra direcciones de Majadahonda; el resto, sin resultado.
  ['GET', /^\/geo\/search$/, (m, b, url) => { const q = new URL(url, B).searchParams.get('q') || ''; return [200, /majadahonda/i.test(q) && !/local/i.test(q) ? [{ lat: '40.4728', lon: '-3.8722', display_name: 'Majadahonda (ficticio)' }] : []]; }],
  ['GET', /^\/notion\/pages\/([^/]+)$/, (m) => { const pg = [...tareas, ...locales, ...incidencias].find((t) => t.id === m[1]); return pg ? [200, pg] : [404, { code: 'object_not_found' }]; }],
  ['PATCH', /^\/notion\/pages\/([^/]+)$/, (m, body) => { const pg = [...tareas, ...locales, ...incidencias].find((t) => t.id === m[1]); if (!pg) return [404, {}]; const pr = JSON.parse(body).properties; Object.assign(pg.properties, Object.fromEntries(Object.entries(pr).map(([k, v]) => [k, { type: Object.keys(v)[0], ...v }]))); pg.last_edited_time = new Date().toISOString(); return [200, pg]; }],
  ['POST', /^\/notion\/pages$/, (m, body) => { lastCreated.push(JSON.parse(body)); return [200, { object: 'page', id: 'cccccccc-0000-0000-0000-00000000000' + log.length % 10, url: 'https://www.notion.so/nueva', body: JSON.parse(body) }]; }],
  ['GET', /^\/graph\/me\/calendarView\/delta/, (m, b, url) => url.includes('page=2')
    ? [200, { value: [{ id: 'ev2', '@removed': { reason: 'deleted' } }], '@odata.deltaLink': `${B}/graph/me/calendarView/delta?token=d1` }]
    : [200, { value: [{ id: 'ev1', subject: 'Reunión FICTICIA', start: { dateTime: iso(1).slice(0, 19) }, end: { dateTime: iso(1.05).slice(0, 19) }, attendees: [{}], isOnlineMeeting: true, webLink: 'https://outlook/ev1', showAs: 'busy' }], '@odata.nextLink': `${B}/graph/me/calendarView/delta?page=2` }]],
  ['GET', /^\/graph\/me\/mailFolders\/inbox\/messages\/delta/, () => [200, { value: [{ id: 'm1', subject: 'Presupuesto FICTICIO', from: { emailAddress: { name: 'Proveedor Prueba', address: 'p@x.test' } }, receivedDateTime: iso(0), bodyPreview: '¿Puedes confirmarlo antes del jueves?', importance: 'normal', webLink: 'https://outlook/m1', flag: { flagStatus: 'notFlagged' } }], '@odata.deltaLink': `${B}/graph/me/mailFolders/inbox/messages/delta?token=x` }]],
  ['GET', /^\/graph\/me\/drive\/root\/delta/, () => [200, { value: [{ id: 'f0', name: 'Carpeta', folder: {} }, { id: 'f1', name: 'Procedimiento de apertura FICTICIO.pdf', file: {}, webUrl: 'https://sp/f1', lastModifiedDateTime: iso(-3), parentReference: { path: '/drive/root:/Operaciones' }, size: 1000 }], '@odata.deltaLink': `${B}/graph/me/drive/root/delta?token=x` }]],
  ['GET', /^\/graph\/me\/chats/, () => [200, { value: [{ id: 'c1', topic: 'Chat prueba', webUrl: 'https://teams/c1', lastMessagePreview: { id: 'lm1', createdDateTime: iso(0), body: { content: '<p>Necesito el informe para mañana</p>' }, from: { user: { displayName: 'Compañero Prueba' } } } }] }]],
  ['POST', /^\/graph\/search\/query$/, () => [200, { value: [{ hitsContainers: [{ hits: [{ summary: 'procedimiento de <c0>apertura</c0>', resource: { id: 'f1', name: 'Procedimiento de apertura FICTICIO.pdf', webUrl: 'https://x.sharepoint.com/sites/ops/f1', lastModifiedDateTime: iso(-3), parentReference: { path: '/drive/root:/Operaciones' } } }] }] }] }]],
];

// Calendario publicado de Outlook (ICS) simulado: una visita mañana, una serie semanal con una excepción y un evento cancelado.
const icsDay = (offset) => { const d = new Date(Date.now() + offset * 864e5); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
let icsCancel = false;
const icsText = () => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'METHOD:PUBLISH', 'BEGIN:VTIMEZONE', 'TZID:Romance Standard Time', 'END:VTIMEZONE',
  'BEGIN:VEVENT', 'UID:visita-1', 'SUMMARY:Visita operativa · Local Prueba 1', 'DESCRIPTION:Programada desde Restalia Ops\\nrestalia-local:bbbbbbbb-0000-0000-0000-000000000001',
  'LOCATION:Calle Ficticia 1\\, Majadahonda', `DTSTART;TZID=Romance Standard Time:${icsDay(1)}T100000`, `DTEND;TZID=Romance Standard Time:${icsDay(1)}T113000`, 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:serie-1', 'SUMMARY:Comité FICTICIO', 'ORGANIZER;CN="Persona Ficticia":mailto:x@example.com', 'ATTENDEE;CN=Y:mailto:y@example.com',
  `DTSTART;TZID=Romance Standard Time:${icsDay(-3)}T090000`, `DTEND;TZID=Romance Standard Time:${icsDay(-3)}T100000`, 'RRULE:FREQ=WEEKLY;COUNT=4',
  'X-MICROSOFT-SKYPETEAMSMEETINGURL:https://teams.microsoft.com/l/meetup-join/ficticio', 'END:VEVENT',
  ...(icsCancel ? [] : ['BEGIN:VEVENT', 'UID:puntual-1', 'SUMMARY:Reunión puntual FICTICIA', `DTSTART;TZID=Romance Standard Time:${icsDay(2)}T160000`, `DTEND;TZID=Romance Standard Time:${icsDay(2)}T170000`, 'END:VEVENT']),
  'END:VCALENDAR'].join('\r\n');

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    log.push(`${req.method} ${req.url}`);
    if (req.url === '/__log') { res.end(JSON.stringify(log)); return; }
    if (req.url === '/__created') { res.end(JSON.stringify(lastCreated)); return; }
    if (req.url === '/ics/calendar.ics') { res.writeHead(200, { 'Content-Type': 'text/calendar' }); res.end(icsText()); return; }
    if (req.url === '/__ics-cancel') { icsCancel = true; res.end('ok'); return; }
    const path = req.url.split('?')[0];
    if (req.url === '/__factorial') { res.end(JSON.stringify(factorialCalls)); return; }
    if (path === '/factorial-mcp/' && req.method === 'POST') { factorialMcp(req, res, body); return; }
    if (/^\/graph\//.test(path) && req.method !== 'GET' && path !== '/graph/search/query') { res.writeHead(500); res.end('ESCRITURA EN GRAPH DETECTADA'); return; }
    for (const [m, re, fn] of routes) {
      const mm = req.method === m && path.match(re);
      if (mm && /authorize$/.test(path)) { const q = new URL(req.url, B).searchParams; res.writeHead(302, { Location: `${q.get('redirect_uri')}?code=abc&state=${q.get('state')}` }); res.end(); return; }
      if (mm) { const [st, out] = fn(mm, body, req.url); res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); return; }
    }
    res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'NotFound' } }));
  });
}).listen(PORT, () => console.log('mock en', B));

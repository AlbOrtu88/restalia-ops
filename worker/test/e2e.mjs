// Prueba de extremo a extremo contra wrangler dev + test/mock-apis.mjs (APIs simuladas, datos ficticios).
// Ver docs/backend.md («Pruebas») para arrancar ambos.
const B = 'http://localhost:8787', M = 'http://localhost:8790';
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const req = (p, { method = 'GET', body, cookie } = {}) => fetch(B + p, { method, redirect: 'manual', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });

// 1. Login Microsoft simulado
let r = await req('/api/auth/login');
const state = new URL(r.headers.get('location')).searchParams.get('state');
r = await req(`/api/auth/callback?state=${state}&code=otro`);
ok(r.status === 302 && /ms=error/.test(r.headers.get('location')) && !r.headers.get('set-cookie'), 'cuenta distinta de ALLOWED_EMAIL → rechazada sin sesión');
r = await req('/api/auth/login');
r = await req(`/api/auth/callback?state=${new URL(r.headers.get('location')).searchParams.get('state')}&code=abc`);
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
ok(r.status === 302 && /ms=ok/.test(r.headers.get('location')) && cookie.startsWith('__Host-rops='), 'login correcto → cookie de sesión');
r = await req(`/api/auth/callback?state=${state}&code=abc`); ok(r.status === 400, 'state reutilizado → 400');
let j = await (await req('/api/auth/status', { cookie })).json();
ok(j.microsoft.connected && j.via === 'microsoft', 'Microsoft conectado');

// 2. Sincronización completa
j = await (await req('/api/sync/run', { method: 'POST', body: {}, cookie })).json();
console.log('   ', JSON.stringify(j.results));
ok(!Object.values(j.results).some((x) => x.error), 'sync sin errores');
let d = await (await req('/api/data?since=1970-01-01', { cookie })).json();
const by = (c) => d.records.filter((x) => x.collection === c && !x.deleted);
ok(by('tareas').length === 2 && by('locales').length === 1, 'Notion: 2 tareas (con paginación) y 1 local');
const t1 = by('tareas').find((x) => x.ref === 'aaaaaaaa-0000-0000-0000-000000000001');
ok(t1?.data.titulo === 'Revisar cámara FICTICIA' && t1.data.estado === 'Pendiente' && t1.data.localNombre === 'Local Prueba 1' && t1.updatedAt && t1.syncedAt, 'mapeo de tarea con source.updatedAt/syncedAt');
const evG = by('eventos').filter((x) => x.system === 'graph'), evI = by('eventos').filter((x) => x.system === 'ics');
ok(evG.length === 1 && evG[0].data.inicio.endsWith('Z') && evG[0].data.esReunion, 'Outlook: evento normalizado (UTC, reunión)');
const vis = evI.find((x) => x.data.titulo.startsWith('Visita operativa'));
ok(evI.length === 6 && vis && /T09:00:00|T10:00:00/.test(vis.data.inicio) && vis.data.ubicacion === 'Calle Ficticia 1, Majadahonda' && vis.data.descripcion.includes('restalia-local:'), `Calendario publicado (ICS): visita en UTC con ubicación y marca del local (${evI.length} eventos)`);
ok(evI.filter((x) => x.data.titulo === 'Comité FICTICIO').length === 4 && evI.find((x) => x.data.titulo === 'Comité FICTICIO').data.online, 'ICS: serie semanal expandida (4) con enlace de Teams');
const mail = by('mensajes').find((x) => x.data.canal === 'outlook');
ok(mail?.data.pendiente && mail.data.plazo?.texto === 'antes del jueves' && mail.data.inferido, 'correo: solicitud y plazo detectados (inferidos)');
ok(by('mensajes').some((x) => x.data.canal === 'teams' && x.data.pendiente), 'Teams chat: solicitud detectada');
ok(by('documentos').length === 1 && by('documentos')[0].data.area === 'Operaciones', 'OneDrive: solo archivos, área inferida');

// 3. Incremental e idempotencia: segunda ejecución no reenvía lo que no cambió
const cur = d.cursor;
await req('/api/sync/run', { method: 'POST', body: {}, cookie });
d = await (await req(`/api/data?since=${encodeURIComponent(cur)}`, { cookie })).json();
ok(d.records.filter((x) => x.syncedAt > cur).length === 0, `segunda sync sin cambios → 0 registros nuevos (${d.records.length} en el límite)`);
const all = await (await req('/api/data?since=1970-01-01', { cookie })).json();
const keys = all.records.map((x) => x.system + x.ref); ok(new Set(keys).size === keys.length, 'sin duplicados por (system, ref)');

// 3b. ICS: un evento que desaparece del calendario publicado se borra en la app
await fetch(M + '/__ics-cancel');
await req('/api/sync/run', { method: 'POST', body: { source: 'ics' }, cookie });
d = await (await req('/api/data?since=1970-01-01', { cookie })).json();
ok(d.records.some((x) => x.system === 'ics' && x.deleted) && !by('eventos').some((x) => x.data.titulo === 'Reunión puntual FICTICIA'), 'ICS: evento eliminado en Outlook → borrado en la app');
j = await (await fetch(B + '/api/health')).json(); ok(j.calendar === true && j.configured.outlookIcs === true && !JSON.stringify(j).includes('8790'), 'health: calendario publicado activo sin exponer el enlace');

// 3c. Fase 4: «Local» como relación, campos nuevos de incidencias y alta de visitas/incidencias en Notion
const incN = by('incidencias').find((x) => x.ref === 'dddddddd-0000-0000-0000-000000000001');
ok(incN?.data.localId === 'bbbbbbbb-0000-0000-0000-000000000001' && incN.data.severidad === 'Alta' && incN.data.causaRaiz === 'Junta gastada' && incN.data.siguientePaso === 'Llamar al técnico' && incN.data.fechaObjetivo, 'Incidencias: «Local» como relación → localId; severidad, causa raíz, siguiente paso y fecha objetivo');
const LOC1 = 'bbbbbbbb-0000-0000-0000-000000000001';
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'apr-v', accion: 'Crear visita', op: { type: 'notion.create', collection: 'visitas', fields: { titulo: 'Visita rutinaria · Local Prueba 1', fecha: '2026-11-21T09:30:00.000Z', localRel: LOC1, localNombre: 'Local Prueba 1', observaciones: 'Todo correcto', resultado: 'Satisfactoria', motivo: 'Visita rutinaria' } } } });
j = await r.json();
let created = (await (await fetch(M + '/__created')).json()).find((x) => x.parent?.data_source_id === 'ds-visitas');
ok(r.status === 200 && created?.properties['Local']?.relation?.[0]?.id === LOC1 && created.properties['Local (texto)']?.rich_text && created.properties['Fecha'].date.start.includes('T09:30') && !created.properties['Resultado general'] && j.skipped.some((x) => x.startsWith('resultado')),
  `Visita creada en Notion enlazada al local (relación), con hora y sin inventar opciones (omitidos: ${JSON.stringify(j.skipped)})`);
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'apr-i', accion: 'Crear incidencia', op: { type: 'notion.create', collection: 'incidencias', fields: { titulo: 'Puerta FICTICIA', localRel: LOC1, localNombre: 'Local Prueba 1', categoria: 'Mantenimiento', prioridad: 'Alta', severidad: 'Media', causaRaiz: 'Golpe', siguientePaso: 'Pedir presupuesto', fechaObjetivo: '2026-11-30' } } } });
created = (await (await fetch(M + '/__created')).json()).filter((x) => x.parent?.data_source_id === 'ds-incidencias').pop();
ok(r.status === 200 && created?.properties['Local'].relation[0].id === LOC1 && created.properties['Severidad'].select.name === 'Media' && created.properties['Causa raíz'] && created.properties['Fecha objetivo'].date.start === '2026-11-30', 'Incidencia creada con relación, severidad, causa raíz y fecha objetivo');
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'apr-i2', accion: 'Crear incidencia', op: { type: 'notion.create', collection: 'incidencias', fields: { titulo: 'x', props: 'hack' } } } });
ok(r.status === 422, 'alta con campo no permitido → 422');
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'apr-c', accion: 'Crear local', op: { type: 'notion.create', collection: 'locales', fields: { nombre: 'x' } } } });
ok(r.status === 422, 'crear locales desde la app → 422');
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'apr-u', accion: 'Causa raíz', op: { type: 'notion.update', collection: 'incidencias', ref: 'dddddddd-0000-0000-0000-000000000001', changes: { causaRaiz: 'Junta nueva', siguientePaso: 'Cerrar', fechaObjetivo: null } } } });
ok(r.status === 200, 'Incidencias: causa raíz y siguiente paso modificables tras aprobación');

// 4. Borrado en origen → tombstone en la sincronización completa
await fetch(M + '/__del', { method: 'POST' });
await req('/api/sync/run', { method: 'POST', body: { source: 'notion:tareas', full: true }, cookie });
d = await (await req(`/api/data?since=${encodeURIComponent(cur)}`, { cookie })).json();
ok(d.records.some((x) => x.ref === 'aaaaaaaa-0000-0000-0000-000000000002' && x.deleted), 'página borrada en Notion → deleted=true');

// 5. Aprobación ejecutada con mapeo real
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'apr-x', accion: 'Cerrar tarea', op: { type: 'notion.update', collection: 'tareas', ref: 'aaaaaaaa-0000-0000-0000-000000000001', changes: { estado: 'Inventado' } } } });
ok(r.status === 422, 'opción de estado que no existe en Notion → 422');
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'apr-x', accion: 'Cerrar tarea', op: { type: 'notion.update', collection: 'tareas', ref: 'aaaaaaaa-0000-0000-0000-000000000001', changes: { titulo: 'x' } } } });
ok(r.status === 422, 'campo no permitido (título) → 422');
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'apr-x', accion: 'Cerrar tarea', op: { type: 'notion.update', collection: 'tareas', ref: 'aaaaaaaa-0000-0000-0000-000000000001', changes: { estado: 'Hecha' } } } });
j = await r.json(); ok(r.status === 200 && j.historial === 'registrado', `estado → Hecha ejecutado y registrado en Historial (${j.historial})`);
const mlog = await (await fetch(M + '/__log')).json();
ok(mlog.some((l) => l.startsWith('PATCH /notion/pages/aaaaaaaa')) && mlog.some((l) => l.startsWith('POST /notion/pages')), 'Notion recibió PATCH y alta en Historial');
ok(!mlog.some((l) => /^(POST|PATCH|PUT|DELETE) \/graph\//.test(l) && !l.includes('/search/query')), 'Graph: ninguna escritura');

// 5b. Locales: mapeo real, comprobación en vivo y escritura con control de conflictos
d = await (await req('/api/data?since=1970-01-01', { cookie })).json();
const loc = d.records.find((x) => x.collection === 'locales' && !x.deleted)?.data || {};
ok(loc.responsableAsignado === 'Responsable Ficticio' && loc.responsable === 'Responsable Ficticio' && loc.gerente === 'Gerente Ficticio', 'Locales: «Responsable asignado» separado de «Gerente»');
ok(loc.municipio === 'Majadahonda' && loc.ciudad === 'Majadahonda' && loc.zona === 'Comunidad de Madrid' && loc.marca === 'Marca Ficticia' && loc.notasGenerales === 'Nota ficticia' && loc.notionEditedAt, 'Locales: Municipio, Zona, Marca, Notas generales y versión de Notion');
ok(loc.lat === 40.4728 && loc.lng === -3.8722 && loc.geoPrecision === 'direccion', 'Locales: geocodificado con la dirección (Nominatim simulado) sin escribir en Notion');
j = await (await req('/api/geo/status', { cookie })).json(); ok(j.total === 1 && j.ubicados === 1, 'estado de ubicaciones: 1 de 1');
j = await (await req('/api/notion/check', { cookie })).json();
ok(j.ok && j.notion.locales === 1 && j.backend.locales === 1 && j.inSync === true && j.notion.conResponsableAsignado === 1 && j.sample?.zona === 'Comunidad de Madrid', 'comprobación en vivo Notion ↔ backend');
r = await req('/api/notion/check'); ok(r.status === 401, 'comprobación en vivo sin sesión → 401');
const LREF = 'bbbbbbbb-0000-0000-0000-000000000001';
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'apr-l', accion: 'Cambiar estado', op: { type: 'notion.update', collection: 'locales', ref: LREF, changes: { estado: 'En seguimiento' } } } });
ok(r.status === 422, 'Locales sin versión (baseEditedAt) → 422');
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'apr-l', accion: 'Cambiar estado', op: { type: 'notion.update', collection: 'locales', ref: LREF, changes: { estado: 'En seguimiento' }, baseEditedAt: '2000-01-01T00:00:00Z' } } });
j = await r.json(); ok(r.status === 409 && j.code === 'conflict', 'Locales cambiado en Notion después de la propuesta → 409 sin escribir');
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'apr-l', accion: 'Renombrar', op: { type: 'notion.update', collection: 'locales', ref: LREF, changes: { nombre: 'x' }, baseEditedAt: loc.notionEditedAt } } });
ok(r.status === 422, 'Locales: campo no permitido (nombre) → 422');
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'apr-l', accion: 'Cambiar estado', op: { type: 'notion.update', collection: 'locales', ref: LREF, changes: { estado: 'En seguimiento', proximaVisita: '2026-12-01', notasGenerales: 'Revisar terraza' }, baseEditedAt: loc.notionEditedAt } } });
j = await r.json(); ok(r.status === 200 && j.collection === 'Locales', `Locales: Estado, Próxima visita y Notas generales escritos tras aprobación (${r.status})`);

// 6. Búsquedas en vivo y esquema
j = await (await req('/api/graph/files?q=apertura', { cookie })).json(); ok(j.live && j.items[0]?.origen === 'SharePoint', 'búsqueda de documentos en SharePoint/OneDrive');
j = await (await req('/api/notion/schema', { cookie })).json();
const st = j.collections.find((c) => c.collection === 'tareas');
ok(st.mapping.estado?.property === 'Estado' && st.properties['Estado'].options.includes('Cancelada') && st.missing.includes('responsable'), 'informe de esquema: mapeo real y campos ausentes');
j = await (await req('/api/sync/status', { cookie })).json(); ok(j.log.length > 0 && j.counts.length > 0, 'estado de sincronización con registro');

// 6b. Factorial (MCP oficial con el login del usuario): registro dinámico, OAuth con PKCE y acciones con confirmación
j = await (await req('/api/factorial/status', { cookie })).json(); ok(j.connected === false, 'Factorial: sin conectar al principio');
r = await req('/api/factorial/tools', { cookie }); ok(r.status === 409, 'Factorial: acciones sin conexión → 409');
r = await req('/api/factorial/connect', { cookie });
let loc2 = new URL(r.headers.get('location') || 'http://x/');
ok(r.status === 302 && loc2.pathname === '/factorial-api/oauth/authorize' && loc2.searchParams.get('client_id') === 'fc-1' && loc2.searchParams.get('code_challenge_method') === 'S256' && loc2.searchParams.get('resource')?.endsWith('/factorial-mcp/') && loc2.searchParams.get('redirect_uri').endsWith('/api/factorial/callback'), 'Factorial: app registrada sola y redirige al login con PKCE y resource');
r = await req('/api/factorial/connect', { cookie }); loc2 = new URL(r.headers.get('location'));
ok(loc2.searchParams.get('client_id') === 'fc-1', 'Factorial: reutiliza el cliente registrado');
r = await req(`/api/factorial/callback?code=abc&state=${loc2.searchParams.get('state')}`, { cookie });
ok(r.status === 302 && /#\/factorial\?fc=ok/.test(r.headers.get('location')), 'Factorial: callback guarda los tokens y vuelve a la app');
r = await req(`/api/factorial/callback?code=abc&state=${loc2.searchParams.get('state')}`, { cookie }); ok(r.status === 400, 'Factorial: state reutilizado → 400');
j = await (await req('/api/factorial/status', { cookie })).json(); ok(j.connected === true, 'Factorial: conectado');
j = await (await req('/api/factorial/tools', { cookie })).json();
ok(j.tools.length === 4 && j.tools.find((t) => t.name === 'get_clock_status').readOnly && !j.tools.find((t) => t.name === 'clock_in').readOnly && j.tools.find((t) => t.name === 'list_leaves').readOnly, 'Factorial: lista de acciones con lectura/escritura');
j = await (await req('/api/factorial/call', { method: 'POST', cookie, body: { name: 'get_clock_status', arguments: {} } })).json();
ok(j.text.includes('clocked_in') && !j.isError, 'Factorial: lectura por MCP (respuesta SSE)');
r = await req('/api/factorial/call', { method: 'POST', cookie, body: { name: 'clock_in', arguments: {} } }); j = await r.json();
ok(r.status === 428 && j.code === 'confirm', 'Factorial: fichar sin confirmación → 428, no se ejecuta');
r = await req('/api/factorial/call', { method: 'POST', cookie, body: { name: 'clock_in', arguments: {}, confirm: true } }); j = await r.json();
ok(r.status === 200 && j.text.includes('Entrada fichada'), 'Factorial: fichar con confirmación');
r = await req('/api/factorial/call', { method: 'POST', cookie, body: { name: 'borrar_todo', arguments: {}, confirm: true } }); ok(r.status === 404, 'Factorial: acción que no ofrece el servidor → 404');
const fcalls = await (await fetch(M + '/__factorial')).json(); ok(fcalls.length === 2 && fcalls.filter((c) => c.name === 'clock_in').length === 1, 'Factorial: solo 1 fichaje llegó al servidor');
j = await (await req('/api/audit', { cookie })).json(); ok(j.items.some((a) => a.action === 'factorial.call' && a.target === 'clock_in'), 'Factorial: fichaje en el registro de auditoría');
j = await (await fetch(B + '/api/health')).json(); ok(j.factorial === true && !JSON.stringify(j).includes('FAT-'), 'health: Factorial conectado sin exponer tokens');
r = await req('/api/factorial/disconnect', { method: 'POST', cookie, body: {} }); j = await (await req('/api/factorial/status', { cookie })).json(); ok(j.connected === false, 'Factorial: desconectar borra los tokens');

// 7. Seguridad
r = await fetch(B + '/api/sync/run', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' }); ok(r.status === 403, 'CSRF: origen ajeno → 403');
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { id: 'a', accion: 'x', datos: {} } }); j = await r.json(); ok(r.status === 422 && j.code === 'no-op', 'aprobación sin op → 422');
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { op: { type: 'graph.files.delete' } } }); ok(r.status === 403, 'operación en Microsoft 365 → 403');
r = await req('/api/approvals/execute', { method: 'POST', cookie, body: { op: { type: 'mail.send' } } }); j = await r.json(); ok(r.status === 403 && j.code === 'mail-disabled', 'envío de correo → 403');
r = await req('/api/data'); ok(r.status === 401, 'sin cookie → 401');
r = await req('/api/auth/key', { method: 'POST', body: { key: 'local-test-access-key-123456789' } }); const kc = r.headers.get('set-cookie') || '';
ok(r.status === 200 && /HttpOnly/.test(kc) && /Secure/.test(kc) && /SameSite=Lax/.test(kc), 'acceso con llave → cookie HttpOnly Secure SameSite=Lax');
r = await req('/api/auth/logout', { method: 'POST', body: {}, cookie }); r = await req('/api/data', { cookie }); ok(r.status === 401, 'tras cerrar sesión → 401');
for (let i = 0; i < 5; i++) await req('/api/auth/key', { method: 'POST', body: { key: 'mala' + i } });
r = await req('/api/auth/key', { method: 'POST', body: { key: 'local-test-access-key-123456789' } }); ok(r.status === 429, '5 intentos fallidos → bloqueo 429');
console.log(fails ? `\n${fails} fallos` : '\nTodo correcto'); process.exit(fails ? 1 : 0);

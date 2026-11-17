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
ok(by('eventos').length === 1 && by('eventos')[0].data.inicio.endsWith('Z') && by('eventos')[0].data.esReunion, 'Outlook: evento normalizado (UTC, reunión)');
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

// 6. Búsquedas en vivo y esquema
j = await (await req('/api/graph/files?q=apertura', { cookie })).json(); ok(j.live && j.items[0]?.origen === 'SharePoint', 'búsqueda de documentos en SharePoint/OneDrive');
j = await (await req('/api/notion/schema', { cookie })).json();
const st = j.collections.find((c) => c.collection === 'tareas');
ok(st.mapping.estado?.property === 'Estado' && st.properties['Estado'].options.includes('Cancelada') && st.missing.includes('responsable'), 'informe de esquema: mapeo real y campos ausentes');
j = await (await req('/api/sync/status', { cookie })).json(); ok(j.log.length > 0 && j.counts.length > 0, 'estado de sincronización con registro');

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

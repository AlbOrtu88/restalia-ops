// Factorial (RR. HH.) a través de su servidor MCP oficial (https://mcp.factorialhr.com).
// · Sin clave de API ni app de administrador: la app se registra sola (registro dinámico de clientes OAuth, RFC 7591)
//   y Alberto entra con SU usuario de Factorial. El token solo puede hacer lo que él ya puede hacer en Factorial.
// · Tokens cifrados (AES-GCM) en D1 (vault «factorial»). Nunca llegan al navegador.
// · Las herramientas que cambian algo (fichar, pedir vacaciones, crear tareas…) exigen confirm:true desde la app
//   y quedan en el registro de auditoría. Nada se ejecuta solo.
import { json, HttpError, now, randomToken, b64url, enc, vaultGet, vaultSet, vaultDel, audit, fetchRetry, Budget } from './util.js';

const MCP_DEFAULT = 'https://mcp.factorialhr.com/';
const PROTOCOL = '2025-06-18';
// Permisos que ofrece el servidor MCP (los de «one:*» solo funcionan si el plan de Restalia incluye Factorial One).
const SCOPES = ['employees', 'tasks', 'time_off', 'time_tracking', 'company_holidays', 'company_locations', 'one:read', 'one:write'];
const TOOLS_TTL = 12 * 3600e3;

const mcpUrl = (env) => (env.FACTORIAL_MCP_URL || MCP_DEFAULT).replace(/\/*$/, '/');

/** Metadatos OAuth del servidor MCP (endpoints de autorización, token y registro). */
async function metadata(env, budget) {
  const base = mcpUrl(env);
  const r = await fetchRetry(new URL('.well-known/oauth-authorization-server', base), { headers: { Accept: 'application/json' } }, budget);
  if (!r.ok) throw new HttpError(502, 'Factorial no responde ahora mismo. Prueba en unos minutos.', 'factorial');
  const m = await r.json();
  if (!m.authorization_endpoint || !m.token_endpoint || !m.registration_endpoint) throw new HttpError(502, 'Factorial ha cambiado su forma de conectar.', 'factorial');
  return m;
}

/** Cliente OAuth propio, registrado una vez por dirección de retorno. */
async function client(env, budget, meta, redirect) {
  const saved = await vaultGet(env, 'factorial_client');
  if (saved?.client_id && saved.redirect === redirect && saved.registration === meta.registration_endpoint) return saved;
  const r = await fetchRetry(meta.registration_endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'Restalia Ops', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], token_endpoint_auth_method: 'client_secret_post', scope: SCOPES.join(' '),
    }),
  }, budget);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.client_id) {
    await audit(env, 'factorial.register', { result: 'error', detail: `${r.status} ${d.error || ''} ${d.error_description || ''}` });
    throw new HttpError(502, 'Factorial no ha aceptado registrar la app. Revisa el registro de auditoría.', 'factorial-register');
  }
  const c = { client_id: d.client_id, client_secret: d.client_secret || null, redirect, registration: meta.registration_endpoint, at: now() };
  await vaultSet(env, 'factorial_client', c);
  await audit(env, 'factorial.register', { detail: 'cliente OAuth registrado' });
  return c;
}

function backToApp(url, status, msg) {
  const to = new URL('/', url.origin);
  to.hash = `#/factorial?fc=${status}${msg ? `&msg=${encodeURIComponent(msg)}` : ''}`;
  return to.toString();
}

/** GET /api/factorial/connect → redirige al inicio de sesión de Factorial. */
export async function connect(env, url) {
  const budget = new Budget(6);
  const meta = await metadata(env, budget);
  const redirect = `${url.origin}/api/factorial/callback`;
  const c = await client(env, budget, meta, redirect);
  const state = randomToken(24), verifier = randomToken(48);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
  await env.DB.prepare('INSERT INTO oauth_state (state, verifier, scopes, created) VALUES (?, ?, ?, ?)').bind(state, verifier, 'factorial:' + SCOPES.join(' '), now()).run();
  await env.DB.prepare('DELETE FROM oauth_state WHERE created < ?').bind(new Date(Date.now() - 15 * 6e4).toISOString()).run();
  const q = new URLSearchParams({
    client_id: c.client_id, response_type: 'code', redirect_uri: redirect, scope: SCOPES.join(' '), state,
    code_challenge: challenge, code_challenge_method: 'S256', resource: mcpUrl(env),
  });
  return Response.redirect(`${meta.authorization_endpoint}?${q}`, 302);
}

async function tokenRequest(env, budget, meta, c, params) {
  const body = new URLSearchParams({ ...params, client_id: c.client_id, resource: mcpUrl(env) });
  if (c.client_secret) body.set('client_secret', c.client_secret);
  const r = await fetchRetry(meta.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body }, budget);
  const tok = await r.json().catch(() => ({}));
  return { ok: r.ok && !!tok.access_token, tok };
}

/** GET /api/factorial/callback → canjea el código y guarda los tokens cifrados. */
export async function callback(env, url, session) {
  const p = url.searchParams;
  if (p.get('error')) {
    await audit(env, 'factorial.callback', { result: 'error', detail: p.get('error') });
    return Response.redirect(backToApp(url, 'error', p.get('error') === 'access_denied' ? 'Has cancelado la conexión' : 'Factorial rechazó la conexión'), 302);
  }
  const st = await env.DB.prepare('SELECT verifier, scopes FROM oauth_state WHERE state = ?').bind(p.get('state') || '').first();
  if (!st || !String(st.scopes).startsWith('factorial:')) throw new HttpError(400, 'Estado OAuth no válido o caducado');
  await env.DB.prepare('DELETE FROM oauth_state WHERE state = ?').bind(p.get('state')).run();
  const budget = new Budget(6);
  const meta = await metadata(env, budget);
  const c = await vaultGet(env, 'factorial_client');
  if (!c) throw new HttpError(400, 'Vuelve a pulsar «Conectar con Factorial»');
  const { ok, tok } = await tokenRequest(env, budget, meta, c, { grant_type: 'authorization_code', code: p.get('code') || '', redirect_uri: c.redirect, code_verifier: st.verifier });
  if (!ok) { await audit(env, 'factorial.token', { result: 'error', detail: tok.error }); return Response.redirect(backToApp(url, 'error', 'No se pudo completar la conexión'), 302); }
  await vaultSet(env, 'factorial', { access: tok.access_token, refresh: tok.refresh_token || null, exp: Date.now() + ((tok.expires_in || 3600) - 60) * 1000, scopes: tok.scope || st.scopes.slice(10), at: now() });
  await vaultDel(env, 'factorial_tools');
  await audit(env, 'factorial.connect', { actor: session.user, detail: tok.scope || '' });
  return Response.redirect(backToApp(url, 'ok'), 302);
}

async function token(env, budget) {
  const t = await vaultGet(env, 'factorial');
  if (!t?.access) throw new HttpError(409, 'Factorial no está conectado', 'factorial-auth');
  if (t.exp > Date.now()) return t;
  if (!t.refresh) { await vaultDel(env, 'factorial'); throw new HttpError(409, 'La conexión con Factorial ha caducado. Vuelve a conectar.', 'factorial-auth'); }
  const meta = await metadata(env, budget);
  const c = await vaultGet(env, 'factorial_client');
  const { ok, tok } = await tokenRequest(env, budget, meta, c || {}, { grant_type: 'refresh_token', refresh_token: t.refresh });
  if (!ok) {
    await audit(env, 'factorial.refresh', { result: 'error', detail: tok.error });
    if (tok.error === 'invalid_grant' || tok.error === 'invalid_client') await vaultDel(env, 'factorial');
    throw new HttpError(409, 'La conexión con Factorial ha caducado. Vuelve a conectar.', 'factorial-auth');
  }
  const next = { ...t, access: tok.access_token, refresh: tok.refresh_token || t.refresh, exp: Date.now() + ((tok.expires_in || 3600) - 60) * 1000 };
  await vaultSet(env, 'factorial', next);
  return next;
}

/** Lee una respuesta MCP (JSON o text/event-stream) y devuelve el mensaje JSON-RPC con ese id. */
export async function readRpc(r, id) {
  const type = r.headers.get('Content-Type') || '';
  const text = await r.text();
  const msgs = [];
  if (type.includes('text/event-stream')) {
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (data) { try { msgs.push(JSON.parse(data)); } catch { /* evento sin JSON */ } }
    }
  } else if (text) {
    try { const j = JSON.parse(text); Array.isArray(j) ? msgs.push(...j) : msgs.push(j); } catch { /* cuerpo no JSON */ }
  }
  return msgs.find((m) => m && m.id === id) || null;
}

/** Abre una sesión MCP y ejecuta un método. Cada llamada: initialize + initialized + método (3 subpeticiones). */
async function rpc(env, budget, method, params) {
  const t = await token(env, budget);
  const base = mcpUrl(env);
  const headers = { Authorization: `Bearer ${t.access}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const post = async (msg, extra = {}) => {
    budget.take();
    return fetch(base, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(msg) });
  };
  let r = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'restalia-ops', version: '1' } } });
  if (r.status === 401 || r.status === 403) {
    await vaultDel(env, 'factorial');
    throw new HttpError(409, 'Factorial ha cerrado la conexión. Vuelve a conectar.', 'factorial-auth');
  }
  const init = r.ok ? await readRpc(r, 1) : null;
  if (!init?.result) throw new HttpError(502, 'Factorial no responde ahora mismo. Prueba en unos minutos.', 'factorial');
  const sid = r.headers.get('Mcp-Session-Id');
  const extra = { 'MCP-Protocol-Version': init.result.protocolVersion || PROTOCOL, ...(sid ? { 'Mcp-Session-Id': sid } : {}) };
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, extra);
  r = await post({ jsonrpc: '2.0', id: 2, method, params }, extra);
  const out = r.ok ? await readRpc(r, 2) : null;
  if (!out) throw new HttpError(502, 'Factorial no ha devuelto respuesta.', 'factorial');
  if (out.error) throw new HttpError(502, `Factorial: ${String(out.error.message || 'error').slice(0, 200)}`, 'factorial');
  return out.result;
}

/** ¿La herramienta solo lee? Se fía de la anotación del servidor y, si no la hay, del nombre. */
export function isReadOnly(tool) {
  if (tool?.annotations && typeof tool.annotations.readOnlyHint === 'boolean') return tool.annotations.readOnlyHint;
  return /^(get|list|read|search|find|show|lookup|check|view|describe|who|my_|current)/i.test(tool?.name || '');
}

async function listTools(env, budget, { fresh = false } = {}) {
  const cached = fresh ? null : await vaultGet(env, 'factorial_tools');
  if (cached?.at && Date.now() - cached.at < TOOLS_TTL) return cached.tools;
  const res = await rpc(env, budget, 'tools/list', {});
  const tools = (res.tools || []).map((t) => ({
    name: t.name, title: t.title || t.annotations?.title || null, description: String(t.description || '').slice(0, 600),
    inputSchema: t.inputSchema || { type: 'object', properties: {} }, readOnly: isReadOnly(t),
  }));
  await vaultSet(env, 'factorial_tools', { at: Date.now(), tools });
  return tools;
}

export async function status(env) {
  const t = await vaultGet(env, 'factorial');
  return json({ connected: !!t?.access, since: t?.at || null, scopes: t?.scopes ? String(t.scopes).split(/\s+/) : [] });
}

export async function tools(env, url) {
  return json({ tools: await listTools(env, new Budget(8), { fresh: url.searchParams.get('fresh') === '1' }) });
}

/** POST /api/factorial/call { name, arguments, confirm } */
export async function call(env, body, session) {
  const name = String(body?.name || '');
  const args = body?.arguments && typeof body.arguments === 'object' ? body.arguments : {};
  if (!/^[\w.:-]{1,80}$/.test(name)) throw new HttpError(400, 'Herramienta no válida');
  const budget = new Budget(10);
  const list = await listTools(env, budget);
  const tool = list.find((t) => t.name === name);
  if (!tool) throw new HttpError(404, 'Factorial no ofrece esa acción. Pulsa «Actualizar acciones».');
  if (!tool.readOnly && body?.confirm !== true) throw new HttpError(428, 'Esta acción cambia datos en Factorial y necesita tu confirmación', 'confirm');
  const res = await rpc(env, budget, 'tools/call', { name, arguments: args });
  const text = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').slice(0, 20000);
  if (!tool.readOnly) await audit(env, 'factorial.call', { actor: session.user, target: name, result: res.isError ? 'error' : 'ok', detail: res.isError ? text.slice(0, 200) : null });
  return json({ name, readOnly: tool.readOnly, isError: !!res.isError, text, structured: res.structuredContent ?? null });
}

export async function disconnect(env, session) {
  await vaultDel(env, 'factorial');
  await vaultDel(env, 'factorial_tools');
  await audit(env, 'factorial.disconnect', { actor: session.user });
  return json({ ok: true });
}

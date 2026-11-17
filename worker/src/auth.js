// Autenticación del BFF.
// · Sesión: cookie __Host-rops (HttpOnly, Secure, SameSite=Lax) con un id aleatorio; en D1 solo se guarda su hash.
// · Microsoft Entra ID: OAuth 2.0 código de autorización + PKCE, cliente confidencial. Tokens cifrados (AES-GCM) en D1.
//   Solo se admite la cuenta ALLOWED_EMAIL del tenant MS_TENANT_ID.
// · Acceso con llave (opcional): ACCESS_KEY fijada por Alberto en Cloudflare, para usar la app antes de tener Entra ID.
import { json, HttpError, now, randomToken, sha256, b64url, enc, parseCookies, vaultGet, vaultSet, vaultDel, audit, safeEqual, fetchRetry } from './util.js';

const COOKIE = '__Host-rops';
const SESSION_DAYS = 30;

// Permisos delegados de Microsoft Graph, todos de lectura. ChannelMessage.Read.All requiere consentimiento de administrador,
// por eso va aparte y solo se pide con /api/auth/login?teams=1 cuando TI lo haya concedido.
export const SCOPES_BASE = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.Read', 'Calendars.Read', 'Files.Read.All', 'Team.ReadBasic.All', 'Channel.ReadBasic.All', 'Chat.Read'];
export const SCOPES_TEAMS = ['ChannelMessage.Read.All'];

export const entraConfigured = (env) => !!(env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET && env.ALLOWED_EMAIL);

function cookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function createSession(env, via, user) {
  const id = randomToken(32);
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id_hash, via, user, created, expires) VALUES (?, ?, ?, ?, ?)').bind(await sha256(id), via, user, now(), exp).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now()).run();
  return cookie(id, SESSION_DAYS * 86400);
}

/** Devuelve la sesión válida o null. */
export async function getSession(env, req) {
  const id = parseCookies(req)[COOKIE];
  if (!id || id.length < 30) return null;
  const row = await env.DB.prepare('SELECT via, user, expires FROM sessions WHERE id_hash = ?').bind(await sha256(id)).first();
  if (!row || row.expires < now()) return null;
  return row;
}

export async function requireSession(env, req) {
  const s = await getSession(env, req);
  if (!s) throw new HttpError(401, 'Sesión no iniciada', 'auth');
  return s;
}

const authority = (env) => `${env.MS_LOGIN_BASE || 'https://login.microsoftonline.com'}/${env.MS_TENANT_ID}/oauth2/v2.0`;

export async function login(env, req, url) {
  if (!entraConfigured(env)) throw new HttpError(503, 'Microsoft Entra ID aún no está configurado en el backend', 'entra');
  const scopes = [...SCOPES_BASE, ...(url.searchParams.get('teams') === '1' ? SCOPES_TEAMS : [])].join(' ');
  const state = randomToken(24), verifier = randomToken(48);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
  await env.DB.prepare('INSERT INTO oauth_state (state, verifier, scopes, created) VALUES (?, ?, ?, ?)').bind(state, verifier, scopes, now()).run();
  await env.DB.prepare('DELETE FROM oauth_state WHERE created < ?').bind(new Date(Date.now() - 15 * 6e4).toISOString()).run();
  const q = new URLSearchParams({
    client_id: env.MS_CLIENT_ID, response_type: 'code', redirect_uri: `${url.origin}/api/auth/callback`, response_mode: 'query',
    scope: scopes, state, code_challenge: challenge, code_challenge_method: 'S256', login_hint: env.ALLOWED_EMAIL, prompt: 'select_account',
  });
  return Response.redirect(`${authority(env)}/authorize?${q}`, 302);
}

function decodeJwtPayload(t) {
  try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))); } catch { return {}; }
}

function backToApp(url, status, msg) {
  const to = new URL('/', url.origin);
  to.hash = `#/configuracion?ms=${status}${msg ? `&msg=${encodeURIComponent(msg)}` : ''}`;
  return to.toString();
}

export async function callback(env, req, url) {
  const p = url.searchParams;
  if (p.get('error')) {
    await audit(env, 'auth.callback', { result: 'error', detail: p.get('error') });
    const msg = /consent|AADSTS65001|AADSTS90094/i.test(p.get('error_description') || '') ? 'Hace falta el consentimiento de TI' : 'Microsoft rechazó el inicio de sesión';
    return Response.redirect(backToApp(url, 'error', msg), 302);
  }
  const st = await env.DB.prepare('SELECT verifier, scopes, created FROM oauth_state WHERE state = ?').bind(p.get('state') || '').first();
  if (!st) throw new HttpError(400, 'Estado OAuth no válido o caducado');
  await env.DB.prepare('DELETE FROM oauth_state WHERE state = ?').bind(p.get('state')).run();
  const r = await fetchRetry(`${authority(env)}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.MS_CLIENT_ID, client_secret: env.MS_CLIENT_SECRET, grant_type: 'authorization_code', code: p.get('code') || '', redirect_uri: `${url.origin}/api/auth/callback`, code_verifier: st.verifier, scope: st.scopes }),
  });
  const tok = await r.json();
  if (!r.ok) { await audit(env, 'auth.token', { result: 'error', detail: tok.error }); return Response.redirect(backToApp(url, 'error', 'No se pudo obtener el token'), 302); }
  const claims = decodeJwtPayload(tok.id_token || '');
  const email = String(claims.preferred_username || claims.email || '').toLowerCase();
  if (claims.tid !== env.MS_TENANT_ID || email !== String(env.ALLOWED_EMAIL).toLowerCase()) {
    await audit(env, 'auth.denied', { result: 'denied', detail: 'cuenta no autorizada' });
    return Response.redirect(backToApp(url, 'error', 'Cuenta no autorizada para esta app'), 302);
  }
  await vaultSet(env, 'ms', {
    access: tok.access_token, refresh: tok.refresh_token, exp: Date.now() + (tok.expires_in - 60) * 1000,
    scopes: tok.scope, oid: claims.oid, name: claims.name, email, at: now(),
  });
  await audit(env, 'auth.login', { actor: email, detail: `microsoft · ${tok.scope}` });
  return new Response(null, { status: 302, headers: { Location: backToApp(url, 'ok'), 'Set-Cookie': await createSession(env, 'microsoft', email) } });
}

/** Token de Graph vigente (renovado si hace falta). null si Microsoft no está conectado. */
export async function graphToken(env, budget) {
  const t = await vaultGet(env, 'ms');
  if (!t?.refresh && !t?.access) return null;
  if (t.exp > Date.now()) return t;
  const r = await fetchRetry(`${authority(env)}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.MS_CLIENT_ID, client_secret: env.MS_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: t.refresh, scope: t.scopes }),
  }, budget);
  const tok = await r.json();
  if (!r.ok) {
    await audit(env, 'auth.refresh', { result: 'error', detail: tok.error });
    if (tok.error === 'invalid_grant') await vaultDel(env, 'ms');
    throw new HttpError(401, 'La conexión con Microsoft ha caducado. Vuelve a iniciar sesión.', 'graph-auth');
  }
  const next = { ...t, access: tok.access_token, refresh: tok.refresh_token || t.refresh, exp: Date.now() + (tok.expires_in - 60) * 1000, scopes: tok.scope || t.scopes };
  await vaultSet(env, 'ms', next);
  return next;
}

export async function keyLogin(env, req) {
  if (!env.ACCESS_KEY || env.ACCESS_KEY.length < 24) throw new HttpError(404, 'Acceso con llave desactivado');
  const fails = await env.DB.prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'auth.key' AND result = 'denied' AND at > ?").bind(new Date(Date.now() - 15 * 6e4).toISOString()).first();
  if (fails.n >= 5) throw new HttpError(429, 'Demasiados intentos. Espera 15 minutos.');
  const { key } = await req.json().catch(() => ({}));
  if (!key || !safeEqual(key, env.ACCESS_KEY)) { await audit(env, 'auth.key', { result: 'denied' }); throw new HttpError(403, 'Llave incorrecta'); }
  await audit(env, 'auth.key', { actor: 'llave' });
  return json({ ok: true }, 200, { 'Set-Cookie': await createSession(env, 'key', 'llave') });
}

export async function logout(env, req) {
  const id = parseCookies(req)[COOKIE];
  if (id) await env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256(id)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
}

/** Desconecta Microsoft: borra los tokens guardados (la sincronización de Graph se detiene). */
export async function disconnectMicrosoft(env, session) {
  await vaultDel(env, 'ms');
  await audit(env, 'auth.disconnect', { actor: session.user });
  return json({ ok: true });
}

export async function status(env, req) {
  const s = await getSession(env, req);
  const ms = s ? await vaultGet(env, 'ms') : null;
  return json({
    authenticated: !!s, via: s?.via || null, user: s ? (ms?.name || s.user) : null,
    entraConfigured: entraConfigured(env), keyLogin: !!(env.ACCESS_KEY && env.ACCESS_KEY.length >= 24),
    microsoft: s ? { connected: !!ms, scopes: ms ? ms.scopes.split(' ').filter((x) => !/^(openid|profile|email)$/.test(x)) : [], since: ms?.at || null } : null,
  });
}

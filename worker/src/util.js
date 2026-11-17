// Utilidades comunes del backend: respuestas, cifrado, reintentos y presupuesto de subpeticiones.

export const now = () => new Date().toISOString();

export class HttpError extends Error {
  constructor(status, message, code = undefined) { super(message); this.status = status; this.code = code; }
}

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store',
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...SEC_HEADERS, ...headers } });
}

export function errorResponse(e) {
  const status = e instanceof HttpError ? e.status : 500;
  // Nunca se devuelven trazas ni cuerpos de terceros que puedan llevar datos sensibles.
  return json({ error: status === 500 ? 'Error interno' : e.message, code: e.code }, status);
}

export const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256(text) { return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text))); }
export async function shortHash(text) { return (await sha256(text)).replace(/[-_]/g, '').slice(0, 20); }

/** Comparación en tiempo constante de dos cadenas. */
export function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function aesKey(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new HttpError(503, 'Falta SESSION_SECRET en el backend', 'config');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('restalia-vault|' + env.SESSION_SECRET));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
/** Cifra un objeto con AES-GCM (clave derivada de SESSION_SECRET). Para tokens OAuth en D1. */
export async function seal(env, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), enc.encode(JSON.stringify(obj)));
  return `${b64url(iv)}.${b64url(ct)}`;
}
export async function unseal(env, str) {
  const [iv, ct] = String(str).split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await aesKey(env), fromB64url(ct));
  return JSON.parse(dec.decode(pt));
}

export async function vaultGet(env, k) {
  const row = await env.DB.prepare('SELECT v FROM vault WHERE k = ?').bind(k).first();
  if (!row) return null;
  try { return await unseal(env, row.v); } catch { return null; }
}
export async function vaultSet(env, k, obj) {
  await env.DB.prepare('INSERT INTO vault (k, v, updated) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated = excluded.updated')
    .bind(k, await seal(env, obj), now()).run();
}
export const vaultDel = (env, k) => env.DB.prepare('DELETE FROM vault WHERE k = ?').bind(k).run();

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** Presupuesto de subpeticiones por invocación (el plan gratuito de Workers admite 50). */
export class Budget {
  constructor(max = 40) { this.left = max; }
  take(n = 1) { if (this.left < n) throw new HttpError(429, 'Presupuesto de peticiones agotado en esta ejecución', 'budget'); this.left -= n; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch con reintentos para 429/5xx respetando Retry-After (máx. 2 reintentos, espera ≤ 8 s). */
export async function fetchRetry(url, init, budget, { tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    budget?.take();
    const r = await fetch(url, init);
    if (r.status !== 429 && r.status < 500) return r;
    if (i === tries - 1) return r;
    const ra = Number(r.headers.get('Retry-After'));
    await sleep(Math.min(8000, (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 800 * 2 ** i)));
  }
}

export async function audit(env, action, { actor = 'sistema', target = null, result = 'ok', detail = null } = {}) {
  try {
    await env.DB.prepare('INSERT INTO audit_log (at, actor, action, target, result, detail) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(now(), actor, action, target, result, detail ? String(detail).slice(0, 500) : null).run();
  } catch (e) { console.error('audit', e.message); }
}

/** Texto plano de HTML (correo/Teams), recortado. */
export function htmlToText(html = '', max = 400) {
  return String(html).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
